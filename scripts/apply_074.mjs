// Apply migration 074: itens_ordem + tipos_ordem_permitidos
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 074: ITENS_ORDEM + PERMISSOES ===\n');

try {
  console.log('── 1. CREATE TABLE itens_ordem ──');
  await sql`
    CREATE TABLE IF NOT EXISTS alissonerp.itens_ordem (
      id            SERIAL       PRIMARY KEY,
      ordem_id      INTEGER      NOT NULL REFERENCES alissonerp.ordens(id) ON DELETE CASCADE,
      produto_id    BIGINT       REFERENCES public.produtos(id_produto),
      nome_produto  TEXT,
      sku           TEXT,
      quantidade    INTEGER      NOT NULL DEFAULT 1,
      peso_estimado NUMERIC(10,2),
      observacao    TEXT,
      created_at    TIMESTAMPTZ  DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_itens_ordem_ordem_id   ON alissonerp.itens_ordem(ordem_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_itens_ordem_produto_id ON alissonerp.itens_ordem(produto_id)`;
  console.log('  ✅ itens_ordem criada');

  console.log('── 2. ADD COLUMN tipos_ordem_permitidos ──');
  await sql`
    ALTER TABLE alissonerp.usuarios
    ADD COLUMN IF NOT EXISTS tipos_ordem_permitidos JSONB DEFAULT '[]'::jsonb
  `;
  console.log('  ✅ tipos_ordem_permitidos adicionada');

  console.log('── 3. GRANTS ──');
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.itens_ordem TO authenticated`;
  await sql`GRANT USAGE, SELECT ON SEQUENCE alissonerp.itens_ordem_id_seq TO authenticated`;
  console.log('  ✅ Grants aplicados');

  // Validação
  const [{ exists: tblExists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = 'itens_ordem'
    ) AS exists
  `;
  const [{ exists: colExists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'usuarios'
      AND column_name = 'tipos_ordem_permitidos'
    ) AS exists
  `;
  console.log(`\n  itens_ordem table: ${tblExists ? '✅' : '❌'}`);
  console.log(`  tipos_ordem_permitidos column: ${colExists ? '✅' : '❌'}`);

  console.log('\n=== MIGRATION 074 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
