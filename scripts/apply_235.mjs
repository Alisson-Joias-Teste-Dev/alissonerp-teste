import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false });

console.log('=== Migration 235: Rota Fabricação Kanban ===\n');
const m = readFileSync('supabase/migrations/235_rota_fabricacao_kanban.sql', 'utf8');
try {
  await sql.unsafe(m);
  console.log('✓ Migration 235 aplicada.\n');
} catch (e) {
  console.error('ERRO:', e.message);
  await sql.end();
  process.exit(1);
}

const cReq = await sql`
  SELECT column_name, column_default FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='setores' AND column_name='requer_peso'
`;
console.log('setores.requer_peso:', cReq[0] ?? 'NÃO EXISTE');

const cOp = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='pcp' AND column_name='operador_atribuido_id'
`;
console.log('pcp.operador_atribuido_id:', cOp[0] ? 'OK' : 'NÃO EXISTE');

const tab = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='alissonerp' AND table_name='setor_operadores'
`;
console.log('setor_operadores:', tab[0] ? 'OK' : 'NÃO EXISTE');

await sql.end();
