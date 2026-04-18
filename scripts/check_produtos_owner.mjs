import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const own = await sql`
    SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='produtos'
  `;
  console.log('Owner de public.produtos:', own[0]?.tableowner);

  const user = await sql`SELECT current_user AS u, session_user AS s`;
  console.log('current_user:', user[0].u, '| session_user:', user[0].s);

  // Checar se postgres tem permissao de ALTER
  const priv = await sql`
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='produtos'
    ORDER BY grantee, privilege_type
  `;
  console.log('\nGrants em public.produtos:');
  priv.forEach(p => console.log(`  ${p.grantee}: ${p.privilege_type}`));
} finally {
  await sql.end();
}
