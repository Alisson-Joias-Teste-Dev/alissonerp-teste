import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const [v] = await sql`SELECT id, numero_venda, cliente_id, data_venda FROM alissonerp.vendas_erp WHERE id = 15870`;
const itens = await sql`SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao FROM alissonerp.itens_venda_erp WHERE venda_id = 15870 ORDER BY id`;
const [contato] = await sql`SELECT id_api_contato FROM public.contatos WHERE id_contato = ${v.cliente_id}`;

console.log('Venda:', v.numero_venda, '| Contato Tiny:', contato?.id_api_contato);
console.log('Itens:', itens.length);

const [tokenRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
let token = tokenRow?.valor_encrypted;
try { token = JSON.parse(token); } catch {}
token = String(token).replace(/"/g, '').trim();

const dataVenda = v.data_venda ? new Date(v.data_venda).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

const pedido = {
  numeroPedido: v.numero_venda,
  idContato: Number(contato.id_api_contato),
  situacao: 1,
  data: dataVenda,
  itens: itens.map(i => ({
    produto: {
      id: 746056974,
      codigo: i.sku || 'SEM-SKU',
      descricao: i.nome_produto || 'Produto',
      tipo: 'P',
    },
    quantidade: Number(i.quantidade),
    valorUnitario: Number(i.preco_unitario),
    ...(i.observacao ? { infoAdicional: i.observacao } : {}),
  })),
};

console.log('Enviando...');
const res = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(pedido),
  signal: AbortSignal.timeout(15000),
});

console.log('Status:', res.status);
const body = await res.text();

if (res.ok) {
  const data = JSON.parse(body);
  await sql`UPDATE alissonerp.vendas_erp SET tiny_pedido_id = ${String(data.id)}, tiny_sync_status = 'sincronizado', tiny_sync_at = NOW(), tiny_sync_erro = NULL WHERE id = 15870`;
  console.log('✅ Venda 15870 → Tiny #', data.id);
} else {
  console.log('❌ Erro:', body.slice(0, 500));
}

await sql.end();
