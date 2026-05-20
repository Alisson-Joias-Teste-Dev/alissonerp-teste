import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
const rows = await sql`SELECT numero_venda, total_venda, total_pago, qtd_itens FROM alissonerp.vw_vendas_erp_completa WHERE numero_venda IN ('15115','15108','15104','15101') ORDER BY numero_venda`;
for (const v of rows) console.log(v.numero_venda + ': total_venda=' + v.total_venda + ' total_pago=' + v.total_pago + ' itens=' + v.qtd_itens);
await sql.end();
