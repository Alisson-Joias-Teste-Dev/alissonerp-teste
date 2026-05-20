// Fix: remove elemento "null" lixo do stone_prices e preenche com valores de mercado 2025
// Jonathan confirmou $600/ct para diamante em conversa anterior; outros valores são de mercado atacado.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

const STONE_PRICES_CORRECT = [
  { tipo: 'diamante',   preco_usd_ct: 600 },
  { tipo: 'moissanita', preco_usd_ct: 80  },
  { tipo: 'rubi',       preco_usd_ct: 350 },
  { tipo: 'esmeralda',  preco_usd_ct: 450 },
  { tipo: 'safira',     preco_usd_ct: 300 },
  { tipo: 'zirconia',   preco_usd_ct: 0   },
];

console.log('=== FIX stone_prices ===\n');

try {
  // ── 1. Snapshot antes ──
  const [before] = await sql`
    SELECT stone_prices FROM alissonerp.config_orcamento WHERE name = 'default'
  `;
  console.log('ANTES:', JSON.stringify(before.stone_prices));

  // ── 2. Limpa e reescreve com valores corretos ──
  await sql`
    UPDATE alissonerp.config_orcamento
       SET stone_prices = ${JSON.stringify(STONE_PRICES_CORRECT)}::jsonb,
           updated_at = NOW()
     WHERE name = 'default'
  `;
  console.log('\n✅ stone_prices resetado com valores de mercado 2025');

  // ── 3. Snapshot depois ──
  const [after] = await sql`
    SELECT stone_prices FROM alissonerp.config_orcamento WHERE name = 'default'
  `;
  console.log('\nDEPOIS:');
  if (Array.isArray(after.stone_prices)) {
    after.stone_prices.forEach((p, i) => {
      console.log(`  [${i}]`, JSON.stringify(p));
    });
  }

  console.log('\n=== FIX CONCLUIDO ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
