import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
try {
  const rows = await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%transfer%'
    ORDER BY table_schema, table_name
  `;
  console.log('Tabelas com "transfer":');
  rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));

  // Tambem procurar estoque
  const r2 = await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'alissonerp' AND table_name ILIKE '%estoque%'
    ORDER BY table_name
  `;
  console.log('\nTabelas alissonerp com "estoque":');
  r2.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
} finally { await sql.end(); }
