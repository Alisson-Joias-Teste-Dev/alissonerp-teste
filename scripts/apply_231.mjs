import postgres from 'postgres';
import { readFileSync } from 'fs';

// Lê DATABASE_URL diretamente do .env.local (sem dependência de dotenv)
const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado em .env.local'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false });

console.log('=== Migration 231: Rota de Fabricação + Reposição Automática ===\n');

const migration = readFileSync('supabase/migrations/231_produto_rota_reposicao.sql', 'utf8');

try {
  await sql.unsafe(migration);
  console.log('✓ Migration 231 aplicada com sucesso.\n');
} catch (e) {
  console.error('ERRO na migration:', e.message);
  await sql.end();
  process.exit(1);
}

// ── Verificações pós-migration ─────────────────────────────────────────────

const tabRepo = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='produto_reposicao_config'
  ORDER BY ordinal_position
`;
console.log('produto_reposicao_config:');
for (const c of tabRepo) console.log(`  ${c.column_name} (${c.data_type})`);

const tabRota = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='produto_rota'
  ORDER BY ordinal_position
`;
console.log('\nproduto_rota:');
for (const c of tabRota) console.log(`  ${c.column_name} (${c.data_type})`);

const colPcp = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='pcp' AND column_name='rota_etapa_atual'
`;
console.log('\npcp.rota_etapa_atual:', colPcp[0] ? `${colPcp[0].data_type} default ${colPcp[0].column_default}` : 'NÃO EXISTE ⚠️');

await sql.end();
console.log('\n=== Migration 231 validada ===');
