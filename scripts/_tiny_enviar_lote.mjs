/**
 * Verifica e envia em lote os pedidos listados ao Tiny.
 * Uso: node scripts/_tiny_enviar_lote.mjs
 */
import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

// Pedidos apontados como não importados (numero_venda ou id)
const PEDIDOS = [
  '15011', '15870', '15068', '15004', '15058', '15032',
  '15080', '15079', '15072', '14980', '15048', '14979',
  '15043', '15016', '15044', '14978', '15067', '14936',
];

const SITUACAO_TINY = { rascunho: 0, aberto: 1, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2 };

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
    const res = await fetch('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      signal: AbortSignal.timeout(10000),
    });
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

async function ensureToken() {
  return await readToken() || await refreshToken();
}

async function enviarVenda(venda, token) {
  const { id: vendaId, numero_venda } = venda;

  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;

  const pagamentos = await sql`
    SELECT forma, valor, parcelas, gateway FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} ORDER BY id
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
      }
    }
  }

  const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
  const produtosTiny = produtoIds.length > 0 ? await sql`
    SELECT id_produto, id_api_produto FROM public.produtos WHERE id_produto = ANY(${produtoIds}) AND id_api_produto IS NOT NULL
  ` : [];
  const tinyIdMap = new Map(produtosTiny.filter(p => p.id_api_produto).map(p => [Number(p.id_produto), Number(p.id_api_produto)]));

  const isOrcamento = !!venda.orcamento_id;
  const TINY_PRODUTO_GENERICO = 746056974;

  const dataVenda = venda.data_venda ? new Date(venda.data_venda).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const pedidoV3 = {
    numeroPedido: numero_venda,
    idContato: Number(venda.cliente_id_tiny),
    situacao: SITUACAO_TINY['aberto'],
    data: dataVenda,
    ...(Number(venda.total_frete) > 0 ? { valorFrete: Number(venda.total_frete) } : {}),
    ...(venda.observacoes ? { observacoes: venda.observacoes } : {}),
    ...(venda.observacoes_internas ? { observacoesInternas: venda.observacoes_internas } : {}),
    ...(venda.vendedor_id_tiny ? { vendedor: { id: Number(venda.vendedor_id_tiny) } } : {}),
    ...(tinyPagamento ? { pagamento: tinyPagamento } : {}),
    itens: itens.map(item => {
      const tinyProdId = tinyIdMap.get(Number(item.produto_id));
      const prodId = tinyProdId || (isOrcamento ? TINY_PRODUTO_GENERICO : 0);
      return {
        produto: {
          id: prodId,
          ...(item.sku ? { codigo: item.sku } : {}),
          descricao: item.nome_produto || 'Produto',
          tipo: 'P',
        },
        quantidade: Number(item.quantidade),
        valorUnitario: Number(item.preco_unitario),
        ...(item.observacao ? { infoAdicional: item.observacao } : {}),
      };
    }),
  };

  let res = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(pedidoV3),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 401) {
    const newToken = await refreshToken();
    if (newToken) {
      token = newToken;
      res = await fetch('https://api.tiny.com.br/public-api/v3/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(pedidoV3),
        signal: AbortSignal.timeout(15000),
      });
    }
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`${res.status}: ${errBody.slice(0, 300)}`);
  }

  const tinyData = await res.json();
  await sql`
    UPDATE alissonerp.vendas_erp
    SET tiny_pedido_id = ${String(tinyData.id ?? '')},
        tiny_sync_status = 'sincronizado',
        tiny_sync_at = NOW(),
        tiny_sync_erro = NULL
    WHERE id = ${vendaId}
  `;
  return { tinyPedidoId: tinyData.id, token };
}

// ── MAIN ────────────────────────────────────────────────────────────────────────

console.log('=== DIAGNÓSTICO DOS PEDIDOS ===\n');

// ── Buscar nas duas tabelas: vendas_erp e public.vendas ─────────────────

// Passo 1: vendas_erp por numero_venda
const vendasErp = await sql`
  SELECT v.id, v.numero_venda, v.situacao, v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_erro,
         v.cliente_id, v.vendedor_id, v.orcamento_id, v.data_venda, v.total_frete,
         v.observacoes, v.observacoes_internas,
         c.nome AS cliente_nome,
         c.id_api_contato AS cliente_id_tiny,
         vd.id_api_vendedor AS vendedor_id_tiny,
         'vendas_erp' AS origem
  FROM alissonerp.vendas_erp v
  LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
  LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
  WHERE v.numero_venda = ANY(${PEDIDOS})
  ORDER BY v.numero_venda
`;

const encontradosNumVenda = new Set(vendasErp.map(v => v.numero_venda));

// Passo 2: para não encontrados, tentar por id
const porNumero = new Set(PEDIDOS);
const naoEncontradosNum = PEDIDOS.filter(p => !encontradosNumVenda.has(p));
const idsBuscar = naoEncontradosNum.map(Number).filter(n => !isNaN(n));

let vendasPorId = [];
if (idsBuscar.length > 0) {
  vendasPorId = await sql`
    SELECT v.id, v.numero_venda, v.situacao, v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_erro,
           v.cliente_id, v.vendedor_id, v.orcamento_id, v.data_venda, v.total_frete,
           v.observacoes, v.observacoes_internas,
           c.nome AS cliente_nome,
           c.id_api_contato AS cliente_id_tiny,
           vd.id_api_vendedor AS vendedor_id_tiny,
           'vendas_erp' AS origem
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.id = ANY(${idsBuscar})
    ORDER BY v.id
  `;
}
const encontradosPorId = new Set(vendasPorId.map(v => String(v.id)));

// Passo 3: public.vendas (tabela legada) para os ainda não encontrados
const todosEncontrados = new Set([
  ...vendasErp.map(v => v.numero_venda),
  ...vendasPorId.map(v => v.id).map(String),
]);
const aindaNaoEncontrados = PEDIDOS.filter(p => !todosEncontrados.has(p));

let publicVendas = [];
if (aindaNaoEncontrados.length > 0) {
  publicVendas = await sql`
    SELECT id, numero_venda, situacao, id_api_tiny AS tiny_pedido_id,
           cliente AS cliente_nome, cliente_id,
           'public.vendas' AS origem
    FROM public.vendas
    WHERE numero_venda = ANY(${aindaNaoEncontrados})
       OR id = ANY(${aindaNaoEncontrados.map(Number).filter(n => !isNaN(n))})
    ORDER BY numero_venda
  `;
}

// Consolidar todas as vendas encontradas
const todasVendas = [...vendasErp, ...vendasPorId, ...publicVendas];

const todosEncontradosFinal = new Set([
  ...vendasErp.map(v => v.numero_venda),
  ...vendasPorId.map(v => String(v.id)),
  ...publicVendas.map(v => v.numero_venda),
]);
const naoEncontrados = PEDIDOS.filter(p => !todosEncontradosFinal.has(p));

console.log(`Localizados (vendas_erp): ${vendasErp.length}`);
console.log(`Localizados (vendas_erp por id): ${vendasPorId.length}`);
console.log(`Localizados (public.vendas legado): ${publicVendas.length}`);
console.log(`Não encontrados: ${naoEncontrados.length}`);
if (naoEncontrados.length > 0) {
  console.log('  ❌', naoEncontrados.join(', '));
}

console.log('\nStatus atual:');
console.log('─'.repeat(90));
for (const v of todasVendas) {
  const isLegado = v.origem === 'public.vendas';
  const num = v.numero_venda || `(id=${v.id})`;
  const tag = isLegado ? ' [LEGADO - não migrado]' : '';
  if (isLegado) {
    const tinyId = v.tiny_pedido_id ? `Tiny #${v.tiny_pedido_id}` : 'Sem Tiny ID';
    console.log(`  ${num.padEnd(8)} | id=${String(v.id).padEnd(6)} | situacao=${(v.situacao || 'N/A').padEnd(12)} | ${tinyId}${tag}`);
  } else {
    const status = v.tiny_pedido_id ? `Tiny #${v.tiny_pedido_id} (${v.tiny_sync_status})` : `NÃO ENVIADO (${v.tiny_sync_status})`;
    const erro = v.tiny_sync_erro ? ` | Erro: ${v.tiny_sync_erro.slice(0, 80)}` : '';
    console.log(`  ${num.padEnd(8)} | id=${String(v.id).padEnd(6)} | situacao=${(v.situacao || 'N/A').padEnd(12)} | ${status}${erro}${tag}`);
  }
}

// Filtrar apenas vendas do vendas_erp que precisam ser enviadas (ignorar legado)
const paraEnviar = vendasErp.filter(v => !v.tiny_pedido_id);

console.log(`\n=== ENVIO PARA TINY (${paraEnviar.length} pedidos pendentes) ===\n`);

if (paraEnviar.length === 0) {
  console.log('Nenhum pedido pendente para enviar no vendas_erp.');
  if (publicVendas.length > 0) {
    console.log(`\n⚠️  ${publicVendas.length} pedido(s) estão apenas na tabela legada public.vendas e precisam ser migrados para vendas_erp primeiro.`);
  }
  await sql.end();
  process.exit(0);
}

// Validar clientes sem Tiny ID
const semClienteTiny = paraEnviar.filter(v => !Number(v.cliente_id_tiny));
if (semClienteTiny.length > 0) {
  console.log('⚠️  Pedidos com cliente sem ID Tiny (não podem ser enviados):');
  for (const v of semClienteTiny) {
    console.log(`   ${v.numero_venda} | Cliente: ${v.cliente_nome || 'N/A'}`);
  }
}

const prontos = paraEnviar.filter(v => Number(v.cliente_id_tiny));

if (prontos.length === 0) {
  console.log('\nNenhum pedido com cliente vinculado ao Tiny. Corrija os clientes primeiro.');
  await sql.end();
  process.exit(0);
}

console.log(`Enviando ${prontos.length} pedidos...\n`);

let token = await ensureToken();
let sucessos = 0;
let falhas = 0;

for (const v of prontos) {
  try {
    const result = await enviarVenda(v, token);
    if (result.token) token = result.token;
    console.log(`  ✅ ${v.numero_venda} (id=${v.id}) → Tiny #${result.tinyPedidoId}`);
    sucessos++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${v.numero_venda} (id=${v.id}) → ${msg}`);
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status='erro', tiny_sync_at=NOW(), tiny_sync_erro=${msg.slice(0, 300)}
      WHERE id = ${v.id}
    `;
    falhas++;
  }
}

console.log(`\n=== RESULTADO ===`);
console.log(`  Sucesso: ${sucessos}`);
console.log(`  Falhas:  ${falhas}`);
console.log(`  Saltados (sem cliente Tiny): ${semClienteTiny.length}`);
console.log(`  Já enviados: ${vendasErp.length - paraEnviar.length}`);
console.log(`  Legado (public.vendas): ${publicVendas.length}`);
console.log(`  Não encontrados: ${naoEncontrados.length}`);

await sql.end();
