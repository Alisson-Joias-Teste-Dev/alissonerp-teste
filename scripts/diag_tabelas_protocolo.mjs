import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const tables = await sql`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name IN ('protocolos', 'protocolo_ordens', 'saidas_ordem')
  ORDER BY table_schema, table_name
`;
console.log('Tabelas:', JSON.stringify(tables, null, 2));
await sql.end();
