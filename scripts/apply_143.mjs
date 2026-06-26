import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 143: Contas a Pagar - Integracao Banco Inter ===\n');

const migrationPath = new URL('../supabase/migrations/143_contas_pagar_inter.sql', import.meta.url);
const sqlText = fs.readFileSync(migrationPath, 'utf-8');

try {
  await sql.unsafe(sqlText);
  console.log('Migration executada.\n');

  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='contas_pagar'
      AND column_name LIKE 'inter_%'
    ORDER BY column_name
  `;
  console.log('Colunas inter_* em contas_pagar:');
  cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='alissonerp' AND table_name='inter_sync_log'
  `;
  console.log('\nTabela inter_sync_log:', tables[0]?.table_name ?? 'NAO ENCONTRADA');

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='alissonerp'
      AND (indexname LIKE 'idx_contas_pagar_inter%' OR indexname LIKE 'idx_inter_sync_log%')
    ORDER BY indexname
  `;
  console.log('\nIndexes:');
  idx.forEach(i => console.log(`  ${i.indexname}`));

  console.log('\n=== MIGRATION 143 CONCLUIDA ===');
} catch (err) {
  console.error('ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
