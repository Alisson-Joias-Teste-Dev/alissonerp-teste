import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== Aplicando Migration 069: tabelas comentarios_ordem e notificacoes ===\n');

const migration = readFileSync('supabase/migrations/069_comentarios_notificacoes.sql', 'utf8');

try {
  await sql.unsafe(migration);
  console.log('Migration 069 aplicada com sucesso.\n');
} catch (e) {
  console.error('ERRO na migration:', e.message);
  await sql.end();
  process.exit(1);
}

// ── Verificações pós-migration ─────────────────────────────────────────────

// 1. Confirmar tabela comentarios_ordem existe
const cols1 = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp'
    AND table_name = 'comentarios_ordem'
  ORDER BY ordinal_position
`;
console.log(`alissonerp.comentarios_ordem (${cols1.length} colunas):`);
for (const c of cols1) console.log(`  ${c.column_name}: ${c.data_type}`);

// 2. Confirmar tabela notificacoes existe
const cols2 = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp'
    AND table_name = 'notificacoes'
  ORDER BY ordinal_position
`;
console.log(`\nalissonerp.notificacoes (${cols2.length} colunas):`);
for (const c of cols2) console.log(`  ${c.column_name}: ${c.data_type}`);

// 3. Confirmar índices criados
const idxs = await sql`
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = 'alissonerp'
    AND tablename IN ('comentarios_ordem', 'notificacoes')
  ORDER BY indexname
`;
console.log(`\nÍndices criados (${idxs.length}):`);
for (const i of idxs) console.log(`  ${i.indexname}`);

// 4. Confirmar publicação Realtime
const pub = await sql`
  SELECT tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'alissonerp'
    AND tablename IN ('comentarios_ordem', 'notificacoes')
  ORDER BY tablename
`;
console.log(`\nRealtime publication (${pub.length} tabelas):`);
for (const p of pub) console.log(`  ${p.tablename} ✓`);

await sql.end();
console.log('\n=== Migration 069 validada com sucesso ===');
