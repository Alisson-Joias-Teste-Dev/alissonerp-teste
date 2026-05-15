// Aplica migration 186_vw_produto_imagens.sql
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1 });

console.log('=== APPLY 186: vw_produto_imagens (galeria agregada) ===\n');

try {
  const path = resolve(__dirname, '../supabase/migrations/186_vw_produto_imagens.sql');
  const ddl = readFileSync(path, 'utf8');
  await sql.unsafe(ddl);
  console.log('✅ DDL aplicado');

  const v = await sql`SELECT 1 FROM pg_views WHERE schemaname='alissonerp' AND viewname='vw_produto_imagens'`;
  console.log(`  view vw_produto_imagens: ${v.length ? '✅' : '❌'}`);

  const sample = await sql`SELECT produto_id, jsonb_array_length(imagens) AS qt, origem_galeria FROM alissonerp.vw_produto_imagens WHERE jsonb_array_length(imagens) > 0 ORDER BY qt DESC LIMIT 5`;
  console.log('\n  Top 5 produtos por nº de imagens:');
  sample.forEach(s => console.log(`    produto ${s.produto_id} → ${s.qt} imgs (origem: ${s.origem_galeria})`));

  console.log('\n✅ Migration 186 aplicada');
} catch (e) {
  console.error('❌ Erro:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
