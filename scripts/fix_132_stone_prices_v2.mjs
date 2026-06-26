// Fix v2: usa sql.json() (ou objeto direto) ao invés de JSON.stringify + cast
// pra evitar que postgres.js salve como JSONB escalar string literal.
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

console.log('=== FIX v2 stone_prices (via sql.json) ===\n');

try {
  // Padrao correto: usa sql.json() pra forçar serializacao JSONB nativa
  await sql`
    UPDATE alissonerp.config_orcamento
       SET stone_prices = ${sql.json(STONE_PRICES_CORRECT)},
           updated_at = NOW()
     WHERE name = 'default'
  `;
  console.log('✅ UPDATE executado');

  // Validacao: tipo e conteudo
  const [row] = await sql`
    SELECT
      jsonb_typeof(stone_prices) AS jb_type,
      jsonb_array_length(stone_prices) AS arr_len,
      stone_prices
    FROM alissonerp.config_orcamento
    WHERE name = 'default'
  `;
  console.log(`\njsonb_typeof: ${row.jb_type}`);
  console.log(`array_length: ${row.arr_len}`);
  console.log(`isArray JS: ${Array.isArray(row.stone_prices)}`);

  if (Array.isArray(row.stone_prices)) {
    console.log('\nElementos:');
    row.stone_prices.forEach((p, i) => {
      console.log(`  [${i}] ${p.tipo}: $${p.preco_usd_ct}/ct`);
    });
  }

  if (row.jb_type === 'array' && row.arr_len === 6) {
    console.log('\n=== FIX v2 CONCLUIDO ✅ ===');
  } else {
    console.log('\n❌ AINDA INCORRETO — tipo:', row.jb_type);
    process.exit(1);
  }
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
