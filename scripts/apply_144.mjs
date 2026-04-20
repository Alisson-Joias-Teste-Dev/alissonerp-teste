import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 144: Curva Dinamica de Precificacao ===\n');

const migrationPath = new URL('../supabase/migrations/144_precificacao_curva_dinamica.sql', import.meta.url);
const sqlText = fs.readFileSync(migrationPath, 'utf-8');

try {
  await sql.unsafe(sqlText);
  console.log('Migration executada.\n');

  // Verificar curva_config
  const config = await sql`
    SELECT id, start_mkp, start_commission, gold_cost_percentage,
           sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
    FROM alissonerp.curva_config WHERE id = 1
  `;
  console.log('curva_config (singleton):');
  config.forEach(c => console.log('  ', c));

  // Verificar curva_categorias
  const cats = await sql`
    SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
    FROM alissonerp.curva_categorias
    ORDER BY ordem ASC
  `;
  console.log(`\ncurva_categorias: ${cats.length} faixas`);
  cats.forEach(c => console.log(`  [${c.ordem}] ${c.nome.padEnd(10)} maxW=${c.max_weight.toString().padStart(6)}g var=${c.variation} commVar=${c.comm_variation} maxDesc=${c.max_discount}%`));

  // Verificar colunas novas em public.produtos
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='produtos'
      AND column_name IN ('comissao_pct', 'max_desconto_pct')
    ORDER BY column_name
  `;
  console.log('\nColunas novas em public.produtos:');
  cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

  // Verificar triggers
  const trgs = await sql`
    SELECT tgname FROM pg_trigger
    WHERE tgname IN ('trg_curva_config_updated_at', 'trg_curva_categorias_updated_at')
    ORDER BY tgname
  `;
  console.log('\nTriggers:');
  trgs.forEach(t => console.log(`  ${t.tgname}`));

  console.log('\n=== MIGRATION 144 CONCLUIDA ===');
} catch (err) {
  console.error('ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
