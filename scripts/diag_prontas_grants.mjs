import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const q4 = await sql`SELECT * FROM alissonerp.vw_ordens_prontas_ida WHERE numero_ordem = 'C-1046'`;
console.log('Q4 view result:', JSON.stringify(q4, null, 2));

const q5 = await sql`
  SELECT grantee, privilege_type FROM information_schema.role_table_grants
  WHERE table_schema = 'alissonerp' AND table_name = 'vw_ordens_prontas_ida'
`;
console.log('Q5 grants:', JSON.stringify(q5, null, 2));

// Check all prontas views grants
const q5b = await sql`
  SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
  WHERE table_schema = 'alissonerp' AND table_name LIKE '%prontas%'
  ORDER BY table_name, grantee
`;
console.log('Q5b all prontas grants:', JSON.stringify(q5b, null, 2));

await sql.end();
