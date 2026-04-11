// Apply migration 132: orcamento_validacao_zirconia
// Adiciona coluna calibracao JSONB em config_orcamento + insere zirconia em stone_prices
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 132: ORCAMENTO VALIDACAO + ZIRCONIA ===\n');

try {
  console.log('── 1. ADD COLUMN calibracao ──');
  await sql`
    ALTER TABLE alissonerp.config_orcamento
      ADD COLUMN IF NOT EXISTS calibracao JSONB DEFAULT '{
        "espessura_min": {"multiplicador": 0.60, "constante": 0.50},
        "largura_min":   {"canaleta": 1.0, "grao": 0.8, "pave": 1.4},
        "folga_pedras":  0.2
      }'::jsonb
  `;
  console.log('  ✅ coluna calibracao adicionada (ou ja existia)');

  console.log('── 2. COMMENT ON COLUMN ──');
  await sql`
    COMMENT ON COLUMN alissonerp.config_orcamento.calibracao IS
      'Parametros de validacao do orcamento de aliancas. Espessura minima = pedra*multiplicador + constante. Largura minima varia por tipo de cravacao (canaleta/grao/pave). Folga = espaco minimo entre pedras.'
  `;
  console.log('  ✅ comment aplicado');

  console.log('── 3. BACKFILL calibracao em registros existentes ──');
  const backfill = await sql`
    UPDATE alissonerp.config_orcamento
       SET calibracao = '{
        "espessura_min": {"multiplicador": 0.60, "constante": 0.50},
        "largura_min":   {"canaleta": 1.0, "grao": 0.8, "pave": 1.4},
        "folga_pedras":  0.2
       }'::jsonb
     WHERE name = 'default' AND calibracao IS NULL
    RETURNING id
  `;
  console.log(`  ✅ ${backfill.count} row(s) backfilled`);

  console.log('── 4. ADD zirconia em stone_prices ──');
  const zirconiaUpdate = await sql`
    UPDATE alissonerp.config_orcamento
       SET stone_prices = COALESCE(stone_prices, '[]'::jsonb)
                          || '[{"tipo":"zirconia","preco_usd_ct":0}]'::jsonb
     WHERE name = 'default'
       AND NOT (COALESCE(stone_prices, '[]'::jsonb) @> '[{"tipo":"zirconia"}]'::jsonb)
    RETURNING id
  `;
  console.log(`  ✅ ${zirconiaUpdate.count} row(s) com zirconia adicionada`);

  // ── Validação final ──
  console.log('\n── VALIDACAO ──');
  const [{ exists: colExists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'alissonerp'
        AND table_name = 'config_orcamento'
        AND column_name = 'calibracao'
    ) AS exists
  `;
  console.log(`  coluna calibracao existe: ${colExists ? '✅' : '❌'}`);

  const [row] = await sql`
    SELECT name, calibracao, stone_prices
    FROM alissonerp.config_orcamento
    WHERE name = 'default'
    LIMIT 1
  `;
  if (row) {
    console.log(`  config 'default' encontrada: ✅`);
    console.log(`  calibracao:`, JSON.stringify(row.calibracao));
    const tiposPedras = Array.isArray(row.stone_prices)
      ? row.stone_prices.map(p => p.tipo).join(', ')
      : 'INVALIDO';
    console.log(`  tipos em stone_prices: ${tiposPedras}`);
    const hasZirconia = Array.isArray(row.stone_prices) && row.stone_prices.some(p => p.tipo === 'zirconia');
    console.log(`  zirconia presente: ${hasZirconia ? '✅' : '❌'}`);
  } else {
    console.log(`  ⚠️  config 'default' NAO encontrada — criar manualmente via UI`);
  }

  console.log('\n=== MIGRATION 132 CONCLUIDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
