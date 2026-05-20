// Aplica migration 179 — produto_personalizacao_regras + colunas campos_gratis
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1 });

console.log('=== APPLY 179: personalizacao campos gratis + regras ===\n');

try {
  const path = resolve(__dirname, '../supabase/migrations/179_personalizacao_campos_gratis.sql');
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

  let executed = 0;
  for (const [i, s] of stmts.entries()) {
    try {
      await sql.unsafe(s);
      const head = s.replace(/\s+/g, ' ').slice(0, 70);
      console.log(`  [${i + 1}/${stmts.length}] ✅ ${head}…`);
      executed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('already exists')) {
        console.log(`  [${i + 1}/${stmts.length}] ⏭️  Já existe: ${s.replace(/\s+/g, ' ').slice(0, 60)}…`);
      } else {
        console.error(`  [${i + 1}/${stmts.length}] ❌ ${msg}`);
        console.error(`     SQL: ${s.replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
  }

  console.log(`\n✅ Migration 179 aplicada (${executed} statements executados).`);
} catch (err) {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
} finally {
  await sql.end();
}
