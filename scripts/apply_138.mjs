// Apply migration 138: Saldo Crédito Gerente + Aprovação em Cascata
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 138: Saldo Crédito Gerente + Aprovação em Cascata ===\n');

try {
  // ── 1. Tabela saldo_credito_loja ──────────────────────────────────────────
  console.log('── 1. CREATE TABLE saldo_credito_loja ──');
  await sql`
    CREATE TABLE IF NOT EXISTS alissonerp.saldo_credito_loja (
      id            SERIAL PRIMARY KEY,
      tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('debito','credito','ajuste')),
      valor         NUMERIC(12,2) NOT NULL,
      saldo_antes   NUMERIC(12,2) NOT NULL,
      saldo_depois  NUMERIC(12,2) NOT NULL,
      venda_id      INTEGER REFERENCES alissonerp.vendas_erp(id),
      pagamento_id  INTEGER REFERENCES alissonerp.pagamentos_venda(id),
      descricao     TEXT,
      usuario_id    UUID REFERENCES auth.users(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log('  ✅ tabela criada');

  await sql`CREATE INDEX IF NOT EXISTS idx_saldo_credito_venda ON alissonerp.saldo_credito_loja(venda_id) WHERE venda_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_saldo_credito_pagamento ON alissonerp.saldo_credito_loja(pagamento_id) WHERE pagamento_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_saldo_credito_created ON alissonerp.saldo_credito_loja(created_at DESC)`;
  console.log('  ✅ indexes criados');

  // ── 2. Seeds configuracoes_sistema ────────────────────────────────────────
  console.log('\n── 2. Seed configuracoes_sistema ──');
  await sql`
    INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
    VALUES
      ('saldo_gerente_limite', '50000', 'Limite máximo do saldo de crédito do gerente de loja (R$)'),
      ('saldo_gerente_atual',  '50000', 'Saldo atual do crédito do gerente de loja (R$) — atualizado automaticamente')
    ON CONFLICT (chave) DO NOTHING
  `;
  const configs = await sql`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema
    WHERE chave IN ('saldo_gerente_limite', 'saldo_gerente_atual')
  `;
  configs.forEach(r => console.log(`  ${r.chave} = ${r.valor}`));

  // ── 3. Novas colunas em vendas_erp ────────────────────────────────────────
  console.log('\n── 3. ALTER TABLE vendas_erp ──');
  await sql`ALTER TABLE alissonerp.vendas_erp ADD COLUMN IF NOT EXISTS credito_gerente_usado NUMERIC(12,2) DEFAULT 0`;
  await sql`ALTER TABLE alissonerp.vendas_erp ADD COLUMN IF NOT EXISTS aprovacao_credito_tipo VARCHAR(20)`;
  await sql`ALTER TABLE alissonerp.vendas_erp ADD COLUMN IF NOT EXISTS aprovacao_credito_tarefa_id INTEGER REFERENCES alissonerp.tarefas(id)`;
  console.log('  ✅ 3 colunas adicionadas em vendas_erp');

  // ── 4. Nova coluna venda_id em tarefas ────────────────────────────────────
  console.log('\n── 4. ALTER TABLE tarefas ──');
  await sql`ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS venda_id INTEGER REFERENCES alissonerp.vendas_erp(id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tarefas_venda ON alissonerp.tarefas(venda_id) WHERE venda_id IS NOT NULL`;
  console.log('  ✅ coluna venda_id adicionada em tarefas');

  // ── 5. Nova role: diretor ─────────────────────────────────────────────────
  console.log('\n── 5. Role diretor ──');
  await sql`
    INSERT INTO alissonerp.roles (nome, descricao)
    VALUES ('diretor', 'Diretor — acesso total + aprovação de crédito acima do saldo')
    ON CONFLICT (nome) DO NOTHING
  `;

  // Copiar permissões do admin para o diretor
  const inserted = await sql`
    INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
    SELECT 'diretor', modulo, pode_ler, pode_escrever
    FROM alissonerp.role_permissoes
    WHERE role = 'admin'
    ON CONFLICT (role, modulo) DO NOTHING
    RETURNING modulo
  `;
  console.log(`  ✅ role 'diretor' criada com ${inserted.length} permissões copiadas do admin`);

  // ── 6. Grants ─────────────────────────────────────────────────────────────
  console.log('\n── 6. Grants ──');
  await sql`GRANT SELECT, INSERT ON alissonerp.saldo_credito_loja TO authenticated`;
  await sql`GRANT USAGE, SELECT ON SEQUENCE alissonerp.saldo_credito_loja_id_seq TO authenticated`;
  console.log('  ✅ grants aplicados');

  // ── 7. Validação ──────────────────────────────────────────────────────────
  console.log('\n── 7. Validação ──');

  const [tabelaExiste] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = 'saldo_credito_loja'
    ) AS exists
  `;
  console.log(`  saldo_credito_loja existe: ${tabelaExiste.exists}`);

  const colunasVenda = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'vendas_erp'
      AND column_name IN ('credito_gerente_usado', 'aprovacao_credito_tipo', 'aprovacao_credito_tarefa_id')
    ORDER BY column_name
  `;
  console.log(`  colunas novas em vendas_erp: ${colunasVenda.map(c => c.column_name).join(', ')}`);

  const [colTarefa] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'tarefas' AND column_name = 'venda_id'
    ) AS exists
  `;
  console.log(`  tarefas.venda_id existe: ${colTarefa.exists}`);

  const [roleDiretor] = await sql`
    SELECT nome FROM alissonerp.roles WHERE nome = 'diretor'
  `;
  console.log(`  role 'diretor': ${roleDiretor ? '✅ existe' : '❌ não encontrada'}`);

  const permDiretor = await sql`
    SELECT COUNT(*)::int AS cnt FROM alissonerp.role_permissoes WHERE role = 'diretor'
  `;
  console.log(`  permissões do diretor: ${permDiretor[0].cnt} módulos`);

  console.log('\n=== MIGRATION 138 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
