import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  for (const num of ['15115','15108','15104','15101']) {
    const [erp] = await sql`SELECT id, numero_venda, total_produtos, total_frete, total_venda, situacao, public_venda_id FROM alissonerp.vendas_erp WHERE numero_venda = ${num}`;
    if (!erp) { console.log(num + ': NAO ENCONTRADA'); continue; }

    const itens = await sql`SELECT id, produto_id, nome_produto, quantidade, preco_unitario, total_item, sku FROM alissonerp.itens_venda_erp WHERE venda_id = ${erp.id} ORDER BY id`;
    const pags = await sql`SELECT id, forma, gateway, valor, parcelas, status, data_confirmacao, ouro_peso, ouro_valor_grama FROM alissonerp.pagamentos_venda WHERE venda_id = ${erp.id} ORDER BY id`;
    const crs = await sql`SELECT id, valor, situacao FROM alissonerp.contas_receber WHERE venda_erp_id = ${erp.id}`;
    
    console.log(`\n=== ${num} (ERP#${erp.id}) ===`);
    console.log(`  total_venda: ${erp.total_venda} | total_produtos: ${erp.total_produtos} | frete: ${erp.total_frete}`);
    console.log(`  situacao: ${erp.situacao} | public_venda_id: ${erp.public_venda_id}`);
    console.log(`  Itens (${itens.length}):`);
    for (const i of itens) console.log(`    #${i.id} ${i.nome_produto} qty=${i.quantidade} unit=${i.preco_unitario} total=${i.total_item}`);
    console.log(`  SUM(total_item)=${itens.reduce((s,i)=>s+Number(i.total_item),0)}`);
    console.log(`  Pagamentos (${pags.length}):`);
    for (const p of pags) console.log(`    #${p.id} ${p.forma} gw=${p.gateway} valor=${p.valor} parcelas=${p.parcelas}x status=${p.status} confirmado=${p.data_confirmacao||'nao'} ouro=${p.ouro_peso||'-'}x${p.ouro_valor_grama||'-'}`);
    const confirmed = pags.filter(p=>p.status==='confirmado').reduce((s,p)=>s+Number(p.valor),0);
    console.log(`  Total confirmado: ${confirmed}`);
    console.log(`  Contas_receber (${crs.length}):`);
    for (const c of crs) console.log(`    CR#${c.id} valor=${c.valor} sit=${c.situacao}`);
  }

  // Check the view for 15115
  console.log('\n=== VIEW vw_vendas_erp_completa para 15115 ===');
  const [vw] = await sql`SELECT total_venda, total_pago, qtd_itens FROM alissonerp.vw_vendas_erp_completa WHERE numero_venda = '15115'`;
  if (vw) console.log(`  total_venda=${vw.total_venda} total_pago=${vw.total_pago} qtd_itens=${vw.qtd_itens}`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
