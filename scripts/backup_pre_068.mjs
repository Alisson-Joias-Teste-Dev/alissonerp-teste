// Backup dos dados críticos antes da migration 068 (enum_role → varchar)
import postgres from 'postgres';
import { writeFileSync } from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== BACKUP PRÉ-068: enum_role → varchar ===\n');

// 1. Estado atual do enum
const enumVals = await sql`SELECT unnest(enum_range(NULL::alissonerp.enum_role)) AS valor`;
console.log('enum_role valores:', enumVals.map(r => r.valor));

// 2. Usuários e suas roles
const usuarios = await sql`
  SELECT id, email, nome, role::text, ativo FROM alissonerp.usuarios ORDER BY role, nome
`;
console.log(`\nUsuários (${usuarios.length}):`);
for (const u of usuarios) {
  console.log(`  [${u.role}] ${u.nome} <${u.email}>`);
}

// 3. Quais tabelas usam enum_role
const colsEnum = await sql`
  SELECT table_name, column_name, udt_name
  FROM information_schema.columns
  WHERE udt_name = 'enum_role' AND table_schema = 'alissonerp'
`;
console.log('\nColunas usando enum_role:', JSON.stringify(colsEnum));

// 4. Funções que referenciam enum_role
const fns = await sql`
  SELECT routine_name, routine_type
  FROM information_schema.routines
  WHERE routine_schema = 'alissonerp'
    AND routine_definition LIKE '%enum_role%'
`;
console.log('\nFunções referenciando enum_role:', fns.map(f => f.routine_name));

// 5. Salvar snapshot JSON dos usuários
const snapshot = { timestamp: new Date().toISOString(), usuarios, enumVals: enumVals.map(r => r.valor) };
writeFileSync('backups/snapshot_pre_068.json', JSON.stringify(snapshot, null, 2));
console.log('\nSnapshot salvo em backups/snapshot_pre_068.json');

await sql.end();
console.log('\n=== BACKUP CONCLUÍDO ===');
