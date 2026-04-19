import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
try {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='vw_vendas_erp_completa'
    ORDER BY ordinal_position
  `;
  console.log('Colunas da view vw_vendas_erp_completa:');
  cols.forEach(c => console.log(' ', c.column_name));
} finally { await sql.end(); }
