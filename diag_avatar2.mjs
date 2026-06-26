import pg from 'postgres';
const sql = pg('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// D3 corrigido: usar name, id_user
const d3 = await sql`SELECT id_user, name, email, role FROM public.user_profiles ORDER BY name`;
console.log('D3 usuários:');
d3.forEach(r => console.log(' ', r.id_user?.toString().slice(0,8)+'...', r.name, '|', r.email, '|', r.role));

// D4 buckets
const d4 = await sql`SELECT id, name, public FROM storage.buckets ORDER BY name`;
console.log('D4 buckets:', d4.map(r => `${r.name}(public=${r.public})`).join(', '));

// D5: auth.users
const d5 = await sql`SELECT id, email FROM auth.users LIMIT 10`;
console.log('D5 auth.users:', d5.map(r => r.email));

// GET /api/user/role — verificar qual arquivo é
await sql.end();
