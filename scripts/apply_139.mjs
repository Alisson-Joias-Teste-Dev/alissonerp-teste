import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 139: Metas tiers + horário/dias ===\n');

try {
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS meta_prata NUMERIC(12,2)`;
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS meta_ouro NUMERIC(12,2)`;
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS meta_diamante NUMERIC(12,2)`;
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS horario_inicio TIME DEFAULT '09:00'`;
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS horas_por_dia INTEGER DEFAULT 8`;
  await sql`ALTER TABLE alissonerp.metas_vendedoras ADD COLUMN IF NOT EXISTS dias_nao_trabalhados INTEGER[] DEFAULT '{}'`;
  console.log('✅ Colunas adicionadas');

  const [backfill] = await sql`UPDATE alissonerp.metas_vendedoras SET meta_prata = meta_valor WHERE meta_prata IS NULL AND meta_valor IS NOT NULL RETURNING id`;
  console.log(`✅ Backfill: ${backfill ? 1 : 0} registros`);

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'metas_vendedoras'
      AND column_name IN ('meta_prata','meta_ouro','meta_diamante','horario_inicio','horas_por_dia','dias_nao_trabalhados')
    ORDER BY column_name
  `;
  console.log(`✅ Colunas verificadas: ${cols.map(c => c.column_name).join(', ')}`);

  console.log('\n=== MIGRATION 139 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
