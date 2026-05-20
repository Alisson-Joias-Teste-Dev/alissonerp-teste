// Aplica migrations 145-150 (Modulo Fiscal) em ordem.
// Cada uma tem verificacao pos-execucao. Se qualquer uma falhar, para.
import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

const MIGRATIONS = [
  { num: 145, file: '145_fiscal_empresas_emitentes.sql',           table: 'empresas_emitentes' },
  { num: 146, file: '146_fiscal_regras_fiscais.sql',               table: 'regras_fiscais' },
  { num: 147, file: '147_fiscal_produtos_contatos_fiscais.sql',    table: 'produtos_fiscais' },
  { num: 148, file: '148_fiscal_add_columns.sql',                  table: null }, // ADD COLUMN
  { num: 149, file: '149_fiscal_notas_fiscais.sql',                table: 'notas_fiscais' },
  { num: 150, file: '150_fiscal_notas_fiscais_itens_eventos.sql',  table: 'notas_fiscais_itens' },
];

console.log('=== APPLY 145-150: Modulo Fiscal (NF-e/NFC-e Sprint 1) ===\n');

try {
  for (const m of MIGRATIONS) {
    const path = new URL(`../supabase/migrations/${m.file}`, import.meta.url);
    const sqlText = fs.readFileSync(path, 'utf-8');
    console.log(`--- Migration ${m.num} ---`);
    await sql.unsafe(sqlText);
    console.log(`  OK: ${m.file}`);

    if (m.table) {
      const [row] = await sql`
        SELECT COUNT(*)::int AS n
        FROM information_schema.tables
        WHERE table_schema='alissonerp' AND table_name=${m.table}
      `;
      console.log(`  tabela alissonerp.${m.table}: ${row.n === 1 ? 'EXISTE' : 'NAO EXISTE (ERRO)'}`);
    }
  }

  // Verificacoes finais consolidadas
  console.log('\n=== VERIFICACOES FINAIS ===');

  const tabelas = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='alissonerp'
      AND table_name IN (
        'empresas_emitentes','regras_fiscais','produtos_fiscais',
        'contatos_fiscais','notas_fiscais','notas_fiscais_itens','notas_fiscais_eventos'
      )
    ORDER BY table_name
  `;
  console.log(`\nTabelas fiscais criadas (esperado 7): ${tabelas.length}`);
  tabelas.forEach(t => console.log(`  - alissonerp.${t.table_name}`));

  const colunasNovas = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='alissonerp'
      AND (
        (table_name='vendedores'                      AND column_name='empresa_emitente_id') OR
        (table_name='vendas_erp'                      AND column_name IN ('empresa_emitente_id','nota_fiscal_id','nfce_numero','nfce_chave_44','nfce_emitida_em')) OR
        (table_name='transferencias_estoque_comercial' AND column_name IN ('empresa_emitente_id','nota_fiscal_remessa_id','nfe_numero','nfe_chave_44','nfe_emitida_em')) OR
        (table_name='devolucoes_venda'                AND column_name IN ('nota_fiscal_devolucao_id','nfe_numero','nfe_chave_44','nfe_emitida_em'))
      )
    ORDER BY table_name, column_name
  `;
  console.log(`\nColunas novas adicionadas (esperado 15):`);
  colunasNovas.forEach(c => console.log(`  ${c.table_name}.${c.column_name}`));

  const fks = await sql`
    SELECT conname
    FROM pg_constraint
    WHERE conname IN ('fk_vendas_erp_nota_fiscal','fk_transf_nota_fiscal_remessa','fk_devolucoes_nota_fiscal')
    ORDER BY conname
  `;
  console.log(`\nFKs para notas_fiscais (esperado 3): ${fks.length}`);
  fks.forEach(f => console.log(`  - ${f.conname}`));

  console.log('\n=== MIGRATIONS 145-150 CONCLUIDAS ===');
} catch (err) {
  console.error('\nERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
