import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const roles = await sql`
  SELECT raw_app_meta_data->>'role' AS role, count(*)::int AS total
  FROM auth.users
  GROUP BY raw_app_meta_data->>'role'
`;
console.log('Roles:', JSON.stringify(roles, null, 2));

const upCols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_profiles'
`;
console.log('\nuser_profiles cols:', JSON.stringify(upCols, null, 2));

// Sample de user_profiles
const upSample = await sql`SELECT * FROM user_profiles LIMIT 5`;
console.log('\nuser_profiles sample:', JSON.stringify(upSample, null, 2));

await sql.end();
