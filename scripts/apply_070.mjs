import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== Aplicando Migration 070: RLS comentarios_ordem + notificacoes ===\n');

const migration = readFileSync('supabase/migrations/070_rls_comentarios_notificacoes.sql', 'utf8');

try {
  await sql.unsafe(migration);
  console.log('Migration 070 aplicada com sucesso.\n');
} catch (e) {
  console.error('ERRO na migration:', e.message);
  await sql.end();
  process.exit(1);
}

// ── Verificações pós-migration ─────────────────────────────────────────────
const [tables, polCom, polNot] = await Promise.all([
  sql`SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname='alissonerp' AND tablename IN ('comentarios_ordem', 'notificacoes')`,
  sql`SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'comentarios_ordem'`,
  sql`SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'notificacoes'`,
]);

console.log('=== RLS ativo? ===');
tables.forEach(t => console.log(` ${t.tablename}: rowsecurity=${t.rowsecurity}`));

console.log('\n=== Policies comentarios_ordem ===');
polCom.forEach(p => console.log(` ${p.policyname} | ${p.cmd} | roles: ${p.roles}`));

console.log('\n=== Policies notificacoes ===');
polNot.forEach(p => console.log(` ${p.policyname} | ${p.cmd} | roles: ${p.roles}`));

await sql.end();
console.log('\n✓ Verificação concluída.');
