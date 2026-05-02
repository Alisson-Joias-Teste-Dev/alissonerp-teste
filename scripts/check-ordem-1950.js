const postgres = require('postgres');
const PROD_URL = 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(PROD_URL, { ssl: false, max: 2, connection: { search_path: 'alissonerp,public' } });

(async () => {
  try {
    // Find the items table name
    console.log('=== TABLES WITH "item" AND "ordem" ===');
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'alissonerp'
        AND (table_name LIKE '%item%ordem%' OR table_name LIKE '%item%')
      ORDER BY table_name
    `;
    console.log(JSON.stringify(tables, null, 2));

    // Try itens_ordem
    console.log('\n=== ITENS (itens_ordem) ===');
    const itens1 = await sql`SELECT * FROM alissonerp.itens_ordem WHERE ordem_id = 1950`;
    console.log(JSON.stringify(itens1, null, 2));

    // Venda 29174
    console.log('\n=== VENDA 29174 ===');
    const [venda] = await sql`
      SELECT id, numero_venda, situacao, total_venda, created_at
      FROM alissonerp.vendas_erp WHERE id = 29174
    `;
    console.log(JSON.stringify(venda, null, 2));

    // Items da venda
    console.log('\n=== ITENS DA VENDA 29174 ===');
    const vitens = await sql`
      SELECT id, sku, nome_produto, quantidade, pct_desconto, preco_unitario, total_item
      FROM alissonerp.itens_venda_erp WHERE venda_id = 29174
    `;
    console.log(JSON.stringify(vitens, null, 2));

    console.log('\n=== CONCLUIDO ===');
  } catch (err) {
    console.error('ERRO:', err);
  } finally {
    await sql.end();
  }
})();
