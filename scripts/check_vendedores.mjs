import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
try {
  const rows = await sql`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%vendedor%'
    ORDER BY table_schema, table_name
  `;
  console.log('Tabelas com "vendedor":');
  rows.forEach(r => console.log(`  ${r.table_schema}.${r.table_name}`));
} finally { await sql.end(); }
