import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// Estrutura protocolo_fotos
const cols = await sql`
  SELECT column_name, data_type, is_nullable FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'protocolo_fotos'
  ORDER BY ordinal_position
`;
console.log('protocolo_fotos cols:', JSON.stringify(cols, null, 2));

// Roles dos usuários (para controle motoboy vs gerente)
const roles = await sql`
  SELECT DISTINCT raw_app_meta_data->>'role' AS role, count(*)
  FROM auth.users WHERE raw_app_meta_data->>'role' IS NOT NULL
  GROUP BY role
`;
console.log('\nRoles em uso:', JSON.stringify(roles, null, 2));

// user_profiles tem campo role?
const upCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_profiles'
`;
console.log('\nuser_profiles cols:', JSON.stringify(upCols, null, 2));

await sql.end();
