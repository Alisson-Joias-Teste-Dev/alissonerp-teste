import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false, max: 1 });

console.log('=== Migration 239: Fix fn_proteger_campos_pdv (app.role) ===\n');
const m = readFileSync('supabase/migrations/239_fix_proteger_campos_app_role.sql', 'utf8');
try {
  await sql.unsafe(m);
  console.log('✓ Migration 239 aplicada.\n');
} catch (e) {
  console.error('ERRO:', e.message);
  await sql.end();
  process.exit(1);
}

// Verifica se a função foi atualizada
const check = await sql`
  SELECT pg_get_functiondef('alissonerp.fn_proteger_campos_pdv()'::regprocedure) AS def
`;
const def = check[0]?.def || '';
if (def.includes("app.role")) {
  console.log('✓ Trigger agora respeita app.role = desenvolvedor.');
} else {
  console.log('⚠ Não foi possível confirmar a atualização. Verifique manualmente.');
}

await sql.end();
