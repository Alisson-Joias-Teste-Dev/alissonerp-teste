import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  for (const num of ['15115','15108','15104','15101']) {
    const [erp] = await sql`SELECT id, numero_venda, total_produtos, total_frete, total_venda, situacao, public_venda_id FROM alissonerp.vendas_erp WHERE numero_venda = ${num}`;
    if (!erp) { console.log('Venda ' + num + ': NAO ENCONTRADA no ERP'); continue; }
    
    const [pub] = await sql`SELECT id, total_produtos, total_venda, frete_pago_cliente, numero_pedido FROM public.vendas WHERE id = ${erp.public_venda_id}`;
    
    const itens = await sql`SELECT id, produto_id, nome_produto, quantidade, preco_unitario, total_item, sku FROM alissonerp.itens_venda_erp WHERE venda_id = ${erp.id} ORDER BY id`;
    
    const pags = await sql`SELECT id, forma, valor, status, data_confirmacao FROM alissonerp.pagamentos_venda WHERE venda_id = ${erp.id} ORDER BY id`;

    const pubItens = pub ? await sql`SELECT id, produto_id, quantidade, preco_unitario_final, preco_total FROM public.itens_venda WHERE venda_id = ${pub.id} ORDER BY id` : [];
    
    console.log('\n=== Venda ERP #' + erp.id + ' (' + erp.numero_venda + ') ===');
    console.log('  situacao: ' + erp.situacao + ' | public_venda_id: ' + erp.public_venda_id);
    console.log('  ERP total_produtos: ' + erp.total_produtos + ' | total_frete: ' + erp.total_frete + ' | total_venda: ' + erp.total_venda);
    if (pub) {
      console.log('  Public total_produtos: ' + pub.total_produtos + ' | total_venda: ' + pub.total_venda + ' | frete: ' + pub.frete_pago_cliente);
      console.log('  Diff ERP-Public total_venda: ' + (Number(erp.total_venda) - Number(pub.total_venda)));
    }
    console.log('  Itens ERP (' + itens.length + '):');
    for (const i of itens) console.log('    id=' + i.id + ' prod=' + i.nome_produto + ' qty=' + i.quantidade + ' unit=' + i.preco_unitario + ' total_item=' + i.total_item + ' sku=' + (i.sku||'null'));
    const sumItems = itens.reduce((s,i) => s + Number(i.total_item), 0);
    console.log('  SUM(total_item) = ' + sumItems);
    if (pubItens.length > 0) {
      console.log('  Itens public (' + pubItens.length + '):');
      for (const pi of pubItens) console.log('    id=' + pi.id + ' prod=' + pi.produto_id + ' qty=' + pi.quantidade + ' unit=' + pi.preco_unitario_final + ' preco_total=' + pi.preco_total);
      const sumPub = pubItens.reduce((s,pi) => s + Number(pi.preco_total || 0), 0);
      console.log('  SUM(preco_total) public = ' + sumPub);
    }
    console.log('  Pagamentos (' + pags.length + '):');
    for (const p of pags) console.log('    id=' + p.id + ' forma=' + p.forma + ' valor=' + p.valor + ' status=' + p.status + ' confirmado=' + (p.data_confirmacao||'nao'));
  }

  // Find ALL problematic orders
  console.log('\n\n=== BUSCANDO TODAS AS VENDAS COM DIVERGENCIA ===');
  const allDivergent = await sql`
    SELECT 
      ve.id AS erp_id, ve.numero_venda, ve.total_venda AS erp_total,
      ve.total_produtos AS erp_produtos,
      pv.total_venda AS pub_total, pv.total_produtos AS pub_produtos,
      ve.situacao,
      (SELECT COUNT(*) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id) AS qtd_itens_erp,
      (SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id) AS sum_items_erp,
      (SELECT COUNT(*) FROM public.itens_venda WHERE venda_id = pv.id) AS qtd_itens_pub,
      (SELECT COALESCE(SUM(preco_total), 0) FROM public.itens_venda WHERE venda_id = pv.id) AS sum_preco_total_pub
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda - pv.total_venda) > 0.01
    ORDER BY ABS(ve.total_venda - pv.total_venda) DESC
  `;

  console.log('Encontradas ' + allDivergent.length + ' vendas com divergencia');
  for (const d of allDivergent) {
    console.log(`  ERP#${d.erp_id} (${d.numero_venda}) ERP=R$${Number(d.erp_total).toFixed(2)} Pub=R$${Number(d.pub_total).toFixed(2)} Diff=R$${(Number(d.erp_total)-Number(d.pub_total)).toFixed(2)} situacao=${d.situacao} itens_erp=${d.qtd_itens_erp} itens_pub=${d.qtd_itens_pub} sum_erp=${Number(d.sum_items_erp).toFixed(2)} sum_pub=${Number(d.sum_preco_total_pub).toFixed(2)}`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
