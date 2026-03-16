import pg from 'postgres';
const sql = pg('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// D1: colunas user_profiles
const d1 = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='user_profiles' ORDER BY ordinal_position`;
console.log('D1 user_profiles cols:', d1.map(r => `${r.column_name}(${r.data_type})`).join(', '));

// D2: já tem foto/avatar?
const d2 = d1.filter(r => /foto|avatar|image|photo/.test(r.column_name));
console.log('D2 foto/avatar cols:', d2.length ? d2.map(r => r.column_name) : 'NENHUM');

// D3: usuários existentes
const d3 = await sql`SELECT id_user, nome, email, role FROM public.user_profiles ORDER BY nome`;
console.log('D3 usuários:', d3.length);
d3.forEach(r => console.log(' ', r.id_user?.toString().slice(0,8), r.nome, r.email, r.role));

// D4: buckets
const d4 = await sql`SELECT id, name, public FROM storage.buckets ORDER BY name`;
console.log('D4 buckets:', JSON.stringify(d4.map(r => ({id: r.id, name: r.name, public: r.public}))));

// D5: auth.users metadata sample
const d5 = await sql`SELECT id, email, raw_user_meta_data FROM auth.users LIMIT 5`;
console.log('D5 auth.users:', d5.map(r => ({id: r.id?.toString().slice(0,8), email: r.email, meta: JSON.stringify(r.raw_user_meta_data).slice(0,80)})));

await sql.end();
