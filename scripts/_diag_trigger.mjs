import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false, max: 1 });

try {
  // 1. Check the actual function source in the DB
  const funcDef = await sql`
    SELECT pg_get_functiondef('alissonerp.fn_proteger_campos_pdv()'::regprocedure) AS def
  `;
  const def = funcDef[0]?.def || '';
  console.log('=== Function definition (first 200 chars) ===');
  console.log(def.substring(0, 200));
  console.log('Has app.role:', def.includes('app.role'));
  console.log('Has current_setting app.role:', def.includes("current_setting('app.role'"));

  // 2. Check all triggers on ordens table
  console.log('\n=== Triggers on alissonerp.ordens ===');
  const triggers = await sql`
    SELECT tgname, tgtype, proname
    FROM pg_trigger t
    JOIN pg_proc p ON t.tgfoid = p.oid
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'alissonerp' AND c.relname = 'ordens'
    ORDER BY tgname
  `;
  for (const t of triggers) {
    console.log(`  ${t.tgname} → ${t.proname} (type: ${t.tgtype})`);
  }

  // 3. Test the update directly (read-only test - no actual update)
  console.log('\n=== Testing set_config + fn_proteger_campos_pdv ===');
  const test = await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.role', 'desenvolvedor', true)`;
    const appRole = await tx`SELECT current_setting('app.role', true) AS val`;
    console.log('app.role value:', appRole[0]?.val);
    return 'OK';
  });
  console.log('Transaction result:', test);

  console.log('\n=== All checks passed ===');
} catch (e) {
  console.error('ERROR:', e.message);
  console.error('Full error:', e);
} finally {
  await sql.end();
}
