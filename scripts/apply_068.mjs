import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== Aplicando Migration 068: enum_role → VARCHAR + tabela roles ===\n');

const migration = readFileSync('supabase/migrations/068_role_varchar.sql', 'utf8');

try {
  await sql.unsafe(migration);
  console.log('Migration 068 aplicada com sucesso.\n');
} catch (e) {
  console.error('ERRO na migration:', e.message);
  await sql.end();
  process.exit(1);
}

// ── Verificações pós-migration ─────────────────────────────────────────────

// 1. Confirmar que role agora é varchar
const colType = await sql`
  SELECT column_name, data_type, character_maximum_length
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp'
    AND table_name = 'usuarios'
    AND column_name = 'role'
`;
console.log('usuarios.role tipo atual:', JSON.stringify(colType[0]));

// 2. Confirmar que enum_role não existe mais
const enumCheck = await sql`
  SELECT typname FROM pg_type
  WHERE typname = 'enum_role' AND typnamespace = (
    SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp'
  )
`;
console.log('enum_role ainda existe?', enumCheck.length > 0 ? 'SIM ⚠️' : 'NÃO ✓');

// 3. Confirmar usuários intactos
const usuarios = await sql`
  SELECT role, COUNT(*)::int FROM alissonerp.usuarios GROUP BY role ORDER BY role
`;
console.log('\nUsuários por role após migration:');
for (const u of usuarios) console.log(`  ${u.role}: ${u.count}`);

// 4. Confirmar tabela roles criada
const roles = await sql`SELECT nome, descricao, ativo FROM alissonerp.roles ORDER BY nome`;
console.log(`\nalissonerp.roles (${roles.length} rows):`);
for (const r of roles) console.log(`  [${r.ativo ? '✓' : '✗'}] ${r.nome} — ${r.descricao}`);

// 5. Confirmar coluna ativo em role_permissoes
const rpCol = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp'
    AND table_name = 'role_permissoes'
    AND column_name = 'ativo'
`;
console.log('\nColuna ativo em role_permissoes:', rpCol.length > 0 ? 'EXISTE ✓' : 'NÃO EXISTE ⚠️');

// 6. Confirmar fn_user_role retorna varchar
const fnCheck = await sql`
  SELECT pg_get_function_result('alissonerp.fn_user_role()'::regprocedure) AS retorno
`;
console.log('\nfn_user_role retorna:', fnCheck[0]?.retorno);

// 7. Confirmar trigger existe
const trig = await sql`
  SELECT trigger_name FROM information_schema.triggers
  WHERE trigger_schema = 'auth' AND trigger_name = 'trg_on_auth_user_created'
`;
console.log('Trigger trg_on_auth_user_created:', trig.length > 0 ? 'EXISTE ✓' : 'NÃO EXISTE ⚠️');

await sql.end();
console.log('\n=== Migration 068 validada ===');
