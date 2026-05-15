import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

const VENDA_ID = 15051;

const [venda] = await sql`
  SELECT
    v.id, v.numero_venda, v.situacao, v.bloqueado,
    v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_erro, v.tiny_sync_at,
    v.cliente_id, v.vendedor_id,
    c.nome AS cliente_nome,
    c.id_api_contato AS cliente_id_tiny,
    vd.nome AS vendedor_nome,
    vd.id_api_vendedor AS vendedor_id_tiny
  FROM alissonerp.vendas_erp v
  LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
  LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
  WHERE v.id = ${VENDA_ID}
`;

console.log('=== Venda 15051 ===');
console.log(JSON.stringify(venda, null, 2));

if (venda) {
  const itens = await sql`
    SELECT i.id, i.produto_id, i.nome_produto, i.sku, i.quantidade, i.preco_unitario,
           p.id_api_produto
    FROM alissonerp.itens_venda_erp i
    LEFT JOIN public.produtos p ON p.id_produto = i.produto_id
    WHERE i.venda_id = ${VENDA_ID} ORDER BY i.id
  `;
  console.log('\n=== Itens ===');
  for (const it of itens) {
    console.log(`  - id=${it.id} prod=${it.produto_id} ${it.nome_produto} qty=${it.quantidade} preco=${it.preco_unitario} id_tiny=${it.id_api_produto ?? 'NULO'}`);
  }

  const pags = await sql`
    SELECT id, forma, valor, parcelas, gateway, status FROM alissonerp.pagamentos_venda WHERE venda_id = ${VENDA_ID} ORDER BY id
  `;
  console.log('\n=== Pagamentos ===');
  for (const p of pags) console.log(`  - ${p.forma} R$${p.valor} (${p.parcelas}x) gw=${p.gateway} status=${p.status}`);
}

await sql.end();
