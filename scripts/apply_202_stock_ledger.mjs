// Aplica migrations 202-205: Stock Ledger Entry + Locais Motoboy + RPC + Entrega
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1 });

// Splits SQL statements respecting dollar-quoted bodies ($$...$$)
function splitStatements(ddl) {
  const stmts = [];
  let buf = '', inDollar = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (ch === '$' && ddl[i + 1] === '$') { inDollar = !inDollar; buf += '$$'; i++; continue; }
    if (ch === ';' && !inDollar) { if (buf.trim()) stmts.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) stmts.push(buf.trim());
  return stmts;
}

async function applyMigration(label, filePath) {
  console.log(`\n[${label}] ${filePath.split('/').pop()}`);
  const ddl = readFileSync(filePath, 'utf8');
  const stmts = splitStatements(ddl);
  let ok = 0;
  for (const [i, s] of stmts.entries()) {
    try {
      await sql.unsafe(s);
      ok++;
    } catch (e) {
      console.error(`  [${i + 1}/${stmts.length}] ❌ ${s.replace(/\s+/g, ' ').slice(0, 80)}\n     → ${e.message}`);
      throw e;
    }
  }
  console.log(`  ✅ ${ok}/${stmts.length} statements`);
}

async function main() {
  const base = resolve(__dirname, '../supabase/migrations');

  // ── Migration 202 ──────────────────────────────────────────────
  await applyMigration('1/4', resolve(base, '202_stock_ledger_entry.sql'));

  const tbl = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='alissonerp' AND table_name='stock_ledger_entry'
  `;
  console.log(`  tabela: ${tbl.length ? '✅' : '❌'}`);

  const trigs = await sql`
    SELECT trigger_name FROM information_schema.triggers
    WHERE event_object_schema='alissonerp' AND event_object_table='stock_ledger_entry'
    ORDER BY trigger_name
  `;
  console.log(`  triggers: ${trigs.map(t => t.trigger_name).join(', ') || '(none)'}`);

  const mirTrig = await sql`
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema='alissonerp' AND event_object_table='movimentacoes_estoque_comercial'
    AND trigger_name='trg_mirror_movimento_to_sle'
  `;
  console.log(`  mirror: ${mirTrig.length ? '✅' : '❌'}`);

  // ── Migration 203 ──────────────────────────────────────────────
  await applyMigration('2/4', resolve(base, '203_locais_motoboy.sql'));

  const locais = await sql`
    SELECT id, nome, is_group, parent_local_id
    FROM alissonerp.locais_estoque ORDER BY id
  `;
  console.log(`  locais: ${locais.map(l => `${l.id}=${l.nome}${l.is_group ? '(G)' : ''}`).join(', ')}`);

  // ── Migration 204 ──────────────────────────────────────────────
  await applyMigration('3/4', resolve(base, '204_rpc_functions.sql'));

  try {
    const [balance] = await sql`SELECT alissonerp.get_sle_balance(1::bigint, 'produto', 2)`;
    console.log(`  get_sle_balance(): ${JSON.stringify(balance)}`);
  } catch (e) {
    console.log(`  get_sle_balance(): ❌ ${e.message}`);
  }

  // ── Migration 205 ──────────────────────────────────────────────
  await applyMigration('4/4', resolve(base, '205_entrega_validation.sql'));

  const ef = await sql`
    SELECT prosrc FROM pg_proc
    WHERE pronamespace='alissonerp'::regnamespace AND proname='fn_estoque_comercial_entrega_venda'
  `;
  console.log(`  entrega function: ${ef[0].prosrc.includes('ENTREGA_BLOCKED') ? '✅ with BLOCK' : '❌'}`);

  console.log('\n✅ Todas as migrations 202-205 aplicadas com sucesso!');
}

main().catch(e => { console.error('\n❌ Erro:', e.message); process.exit(1); }).finally(() => sql.end());
