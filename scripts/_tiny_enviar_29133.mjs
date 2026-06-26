/**
 * Envia venda id=29133 (numero_venda=15051) ao Tiny
 */
import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const VENDA_ID = 29133;
const SITUACAO_TINY = { rascunho: 0, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2 };

async function readToken() {
  const [row] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
  if (!row?.valor_encrypted) return null;
  let t; try { t = JSON.parse(row.valor_encrypted); } catch { t = String(row.valor_encrypted); }
  return t.replace(/"/g, '').trim() || null;
}
async function refreshToken() {
  const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
  const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
  const [rtRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_refresh_token'`;
  const parse = v => { try { return JSON.parse(v); } catch { return String(v); } };
  const clientId = parse(ciRow.valor_encrypted).replace(/"/g, '').trim();
  const clientSecret = parse(csRow.valor_encrypted).replace(/"/g, '').trim();
  const attempts = [];
  if (rtRow?.valor_encrypted) {
    const rt = parse(rtRow.valor_encrypted).replace(/"/g, '').trim();
    if (rt) attempts.push(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId, client_secret: clientSecret }));
  }
  attempts.push(new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }));
  for (const body of attempts) {
    const res = await fetch('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) continue;
    const tokens = await res.json();
    await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
    if (tokens.refresh_token) await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}`;
    if (tokens.expires_in) {
      const ea = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_token_expires_at', ${JSON.stringify(ea)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(ea)}`;
    }
    return tokens.access_token;
  }
  return null;
}

const [venda] = await sql`
  SELECT v.id, v.numero_venda, v.cliente_id, v.vendedor_id, v.orcamento_id,
    v.data_venda, v.data_entrega, v.total_frete, v.observacoes, v.observacoes_internas,
    v.tiny_pedido_id,
    c.id_api_contato AS cliente_id_tiny, c.nome AS cliente_nome,
    vd.id_api_vendedor AS vendedor_id_tiny
  FROM alissonerp.vendas_erp v
  LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
  LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
  WHERE v.id = ${VENDA_ID}
`;
if (venda.tiny_pedido_id) { console.log('Já tem tiny_pedido_id', venda.tiny_pedido_id, '— abortando.'); await sql.end(); process.exit(0); }
if (!Number(venda.cliente_id_tiny)) { console.log('Cliente sem Tiny ID. Abortar.'); await sql.end(); process.exit(1); }

const itens = await sql`
  SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
  FROM alissonerp.itens_venda_erp WHERE venda_id = ${VENDA_ID} ORDER BY id
`;
const pagamentos = await sql`
  SELECT forma, valor, parcelas, gateway FROM alissonerp.pagamentos_venda WHERE venda_id = ${VENDA_ID} ORDER BY id
`;

let tinyPagamento = null;
if (pagamentos.length > 0) {
  const formaPag = pagamentos[0].forma;
  const [fpRow] = await sql`SELECT id_api_tiny FROM public.forma_pagamento WHERE descricao = ${formaPag} AND status = true LIMIT 1`;
  if (fpRow?.id_api_tiny) {
    tinyPagamento = { formaRecebimento: { id: Number(fpRow.id_api_tiny) } };
    if (pagamentos[0].gateway) {
      const [mpRow] = await sql`
        SELECT mp.id_api_tiny FROM public.meio_pagamento mp
        JOIN public.forma_pagamento fp ON fp.id = mp.forma_pagamento_id
        WHERE fp.descricao = ${formaPag} AND mp.descricao = ${pagamentos[0].gateway} AND mp.status = true LIMIT 1
      `;
      if (mpRow?.id_api_tiny) tinyPagamento.meioPagamento = { id: Number(mpRow.id_api_tiny) };
      else console.log('⚠ gateway "' + pagamentos[0].gateway + '" não mapeado em meio_pagamento — enviando sem meioPagamento');
    }
  }
}

const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
const produtosTiny = produtoIds.length > 0 ? await sql`
  SELECT id_produto, id_api_produto FROM public.produtos WHERE id_produto = ANY(${produtoIds}) AND id_api_produto IS NOT NULL
` : [];
const tinyIdMap = new Map(produtosTiny.filter(p => p.id_api_produto).map(p => [Number(p.id_produto), Number(p.id_api_produto)]));

const semProduto = itens.filter(i => !i.produto_id || !tinyIdMap.has(Number(i.produto_id)));
if (semProduto.length > 0) {
  console.log(`Item "${semProduto[0].nome_produto}" sem id_api_produto. Abortando.`);
  await sql.end(); process.exit(1);
}

const dataVenda = venda.data_venda ? new Date(venda.data_venda).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

const pedidoV3 = {
  numeroPedido: venda.numero_venda,
  idContato: Number(venda.cliente_id_tiny),
  situacao: SITUACAO_TINY['aprovado'],
  data: dataVenda,
  ...(Number(venda.total_frete) > 0 ? { valorFrete: Number(venda.total_frete) } : {}),
  ...(venda.observacoes ? { observacoes: venda.observacoes } : {}),
  ...(venda.observacoes_internas ? { observacoesInternas: venda.observacoes_internas } : {}),
  ...(venda.vendedor_id_tiny ? { vendedor: { id: Number(venda.vendedor_id_tiny) } } : {}),
  ...(tinyPagamento ? { pagamento: tinyPagamento } : {}),
  itens: itens.map(item => ({
    produto: {
      id: tinyIdMap.get(Number(item.produto_id)),
      ...(item.sku ? { codigo: item.sku } : {}),
      descricao: item.nome_produto || 'Produto',
      tipo: 'P',
    },
    quantidade: Number(item.quantidade),
    valorUnitario: Number(item.preco_unitario),
    ...(item.observacao ? { infoAdicional: item.observacao } : {}),
  })),
};

console.log('\n=== Payload ===\n' + JSON.stringify(pedidoV3, null, 2));

let token = await readToken() || await refreshToken();
let res = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify(pedidoV3),
});
if (res.status === 401) {
  token = await refreshToken();
  res = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(pedidoV3) });
}
console.log(`\nPOST → ${res.status}`);
if (!res.ok) {
  const errBody = await res.text();
  console.log('Erro:', errBody);
  await sql`UPDATE alissonerp.vendas_erp SET tiny_sync_status='erro', tiny_sync_at=NOW(), tiny_sync_erro=${errBody.slice(0, 300)} WHERE id=${VENDA_ID}`;
  await sql.end(); process.exit(1);
}
const tinyData = await res.json();
console.log('Resposta:', JSON.stringify(tinyData, null, 2));
await sql`
  UPDATE alissonerp.vendas_erp
  SET tiny_pedido_id = ${String(tinyData.id ?? '')}, tiny_sync_status = 'sincronizado', tiny_sync_at = NOW(), tiny_sync_erro = NULL
  WHERE id = ${VENDA_ID}
`;
console.log('\n✅ Sincronizado. tiny_pedido_id =', tinyData.id);
await sql.end();
