import postgres from './scripts/tsl-bridge/node_modules/postgres/src/index.js';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', {ssl:false, max:2, idle_timeout:20, connection:{search_path:'alissonerp,public'}});

const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='vw_estoque_comercial_alerta_v2'`;
console.log('Colunas:', JSON.stringify(cols, null, 2));

const count = await sql`SELECT COUNT(*)::int FROM alissonerp.vw_estoque_comercial_alerta_v2`;
console.log('Total linhas:', count[0]?.count);

const sample = await sql`SELECT * FROM alissonerp.vw_estoque_comercial_alerta_v2 LIMIT 3`;
console.log('Amostra:', JSON.stringify(sample, null, 2));

const skus = ['AJ5207', '1518-14', 'AJ4912', '1099-14', '1468-12'];
for (const sku of skus) {
  const found = await sql`SELECT sku, saldo_fisico FROM alissonerp.vw_estoque_comercial_alerta_v2 WHERE sku = ${sku}`;
  if (found.length > 0) console.log(`SKU ${sku}: SALDO=${found[0]?.saldo_fisico}`);
  else {
    const foundCI = await sql`SELECT sku, saldo_fisico FROM alissonerp.vw_estoque_comercial_alerta_v2 WHERE LOWER(sku) = LOWER(${sku})`;
    if (foundCI.length > 0) console.log(`SKU ${sku}: encontrado como ${foundCI[0]?.sku}, SALDO=${foundCI[0]?.saldo_fisico}`);
    else console.log(`SKU ${sku}: NAO ENCONTRADO`);
  }
}

process.exit(0);
