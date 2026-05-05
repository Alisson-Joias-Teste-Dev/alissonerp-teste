import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false });

console.log('=== Migration 234: Setores cleanup + dedup ===\n');

// Snapshot ANTES
const antes = await sql`
  SELECT LOWER(TRIM(nome)) AS chave, COUNT(*) FILTER (WHERE ativo) AS ativos
  FROM alissonerp.setores GROUP BY LOWER(TRIM(nome)) HAVING COUNT(*) FILTER (WHERE ativo) > 1
`;
console.log('Duplicatas ANTES:', antes.length);
for (const r of antes) console.log(`  • ${r.chave} → ${r.ativos} ativos`);

const m = readFileSync('supabase/migrations/234_setores_cleanup_dedup.sql', 'utf8');
try {
  await sql.unsafe(m);
  console.log('\n✓ Migration 234 aplicada.\n');
} catch (e) {
  console.error('ERRO:', e.message);
  await sql.end();
  process.exit(1);
}

// Snapshot DEPOIS
const depois = await sql`
  SELECT LOWER(TRIM(nome)) AS chave, COUNT(*) FILTER (WHERE ativo) AS ativos
  FROM alissonerp.setores GROUP BY LOWER(TRIM(nome)) HAVING COUNT(*) FILTER (WHERE ativo) > 1
`;
console.log('Duplicatas DEPOIS:', depois.length);

const totalAtivos = await sql`SELECT COUNT(*)::int AS n FROM alissonerp.setores WHERE ativo`;
const totalInativos = await sql`SELECT COUNT(*)::int AS n FROM alissonerp.setores WHERE NOT ativo`;
console.log(`Setores ativos:   ${totalAtivos[0].n}`);
console.log(`Setores inativos: ${totalInativos[0].n}`);

// Lista atual
const lista = await sql`SELECT id, nome FROM alissonerp.setores WHERE ativo ORDER BY id`;
console.log('\nSetores ativos:');
for (const s of lista) console.log(`  ${s.id}. ${s.nome}`);

// Verificar índice
const idx = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname='alissonerp' AND tablename='setores' AND indexname='uniq_setores_nome_ativo'
`;
console.log('\nÍndice unique:', idx[0] ? 'criado ✓' : 'NÃO criado ⚠️');

await sql.end();
