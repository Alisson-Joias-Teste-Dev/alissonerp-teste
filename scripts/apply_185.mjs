// Aplica migration 185_produto_imagens.sql
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1 });

console.log('=== APPLY 185: galeria produto_imagens + view capa ===\n');

try {
  const path = resolve(__dirname, '../supabase/migrations/185_produto_imagens.sql');
  const ddl = readFileSync(path, 'utf8');
  // split em statements top-level, respeitando dollar-quoted bodies ($$...$$)
  const stmts = [];
  let buf = '', inDollar = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (ch === '$' && ddl[i + 1] === '$') { inDollar = !inDollar; buf += '$$'; i++; continue; }
    if (ch === ';' && !inDollar) { if (buf.trim()) stmts.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) stmts.push(buf.trim());
  for (const [i, s] of stmts.entries()) {
    try {
      await sql.unsafe(s);
      const head = s.replace(/\s+/g, ' ').slice(0, 70);
      console.log(`  [${i + 1}/${stmts.length}] ✅ ${head}…`);
    } catch (e) {
      console.error(`  [${i + 1}/${stmts.length}] ❌ ${s.slice(0, 200)}\n     → ${e.message}`);
      throw e;
    }
  }
  console.log('✅ DDL aplicado');

  const cols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='produto_imagens'
    ORDER BY ordinal_position`;
  console.log(`\n  produto_imagens (${cols.length} colunas):`);
  cols.forEach(c => console.log(`    - ${c.column_name} (${c.data_type})`));

  const idx = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='alissonerp' AND tablename='produto_imagens'
    ORDER BY indexname`;
  console.log(`\n  índices: ${idx.map(i => i.indexname).join(', ')}`);

  const view = await sql`
    SELECT 1 FROM pg_views WHERE schemaname='alissonerp' AND viewname='vw_produto_capa'`;
  console.log(`  view vw_produto_capa: ${view.length ? '✅' : '❌'}`);

  console.log('\n✅ Migration 185 aplicada com sucesso');
} catch (e) {
  console.error('❌ Erro:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
