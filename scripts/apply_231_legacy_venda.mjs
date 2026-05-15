// Aplica migration 231_add_legacy_venda.sql
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1, connection: { search_path: "alissonerp,public" } });

console.log('=== APPLY 231: add is_legacy, atualiza view, indice ===\n');

try {
  const path = resolve(__dirname, '../supabase/migrations/231_add_legacy_venda.sql');
  const ddl = readFileSync(path, 'utf8');
  await sql.unsafe(ddl);
  console.log('DDL aplicado');

  const col = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='vendas_erp' AND column_name='is_legacy'
  `;
  console.log(`  coluna is_legacy: ${col.length ? 'OK' : 'FALHOU'}`);

  const view = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='vw_vendas_erp_completa' AND column_name='is_legacy'
  `;
  console.log(`  view vw_vendas_erp_completa.is_legacy: ${view.length ? 'OK' : 'FALHOU'}`);

  console.log('\nMigration 231 aplicada');
} catch (e) {
  console.error('Erro:', e.message);
  process.exit(1);
} finally {
  await sql.end();
}
