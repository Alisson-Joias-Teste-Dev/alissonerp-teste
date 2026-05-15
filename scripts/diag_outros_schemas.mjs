import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

const tables = await sql`
  SELECT table_schema, table_name FROM information_schema.tables
  WHERE table_name IN ('aprovacoes_consultora','preparacoes_entrega','aprovacoes_consultoras','preparacoes_entregas')
  ORDER BY table_schema, table_name
`;
console.log(JSON.stringify(tables, null, 2));
await sql.end();
