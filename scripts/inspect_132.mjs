// Inspeciona estado atual de config_orcamento.stone_prices
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const [row] = await sql`
    SELECT name, stone_prices, stone_markup, calibracao
    FROM alissonerp.config_orcamento
    WHERE name = 'default'
  `;

  console.log('=== INSPECT config_orcamento default ===\n');
  console.log('stone_markup:', row.stone_markup);
  console.log('calibracao:', JSON.stringify(row.calibracao, null, 2));
  console.log('\nstone_prices (raw):', row.stone_prices);
  console.log('\nstone_prices (tipo):', typeof row.stone_prices);
  console.log('stone_prices (isArray):', Array.isArray(row.stone_prices));

  if (Array.isArray(row.stone_prices)) {
    console.log(`\nstone_prices tem ${row.stone_prices.length} elementos:`);
    row.stone_prices.forEach((p, i) => {
      console.log(`  [${i}]`, JSON.stringify(p));
    });
  }
} finally {
  await sql.end();
}
