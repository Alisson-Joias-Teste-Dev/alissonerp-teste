import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false });

console.log('=== Migration 233: Tempo de Fabricação ===\n');
const m = readFileSync('supabase/migrations/233_produto_tempo_fabricacao.sql', 'utf8');
try {
  await sql.unsafe(m);
  console.log('✓ Migration 233 aplicada.\n');
} catch (e) {
  console.error('ERRO:', e.message);
  await sql.end();
  process.exit(1);
}

const col = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='produto_reposicao_config'
    AND column_name='tempo_fabricacao_dias'
`;
console.log('produto_reposicao_config.tempo_fabricacao_dias:', col[0] ?? 'NÃO EXISTE');
await sql.end();
