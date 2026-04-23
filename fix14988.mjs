import sql from './src/lib/db.js';
const pags = await sql`SELECT id, forma, valor::numeric, status FROM alissonerp.pagamentos_venda WHERE venda_id = 14988 ORDER BY id`;
console.log('Pagamentos:', JSON.stringify(pags, null, 2));
const [v] = await sql`SELECT total_venda, situacao FROM alissonerp.vendas_erp WHERE id = 14988`;
console.log('Venda:', JSON.stringify(v));
await sql.end();
