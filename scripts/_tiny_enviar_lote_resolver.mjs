/**
 * Sincroniza clientes ao Tiny e reenvia pedidos pendentes.
 * Uso: node scripts/_tiny_enviar_lote_resolver.mjs
 */
import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const SITUACAO_TINY = { rascunho: 0, aberto: 1, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2 };

// ── TOKEN ────────────────────────────────────────────────────────────────────────

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

// ── SINCRONIZAR CONTATO ─────────────────────────────────────────────────────────

function buildContatoPayload(c) {
  const payload = { nome: c.nome };
  if (c.cpf_cnpj) payload.cpfCnpj = String(c.cpf_cnpj);
  if (c.email) payload.email = String(c.email);
  if (c.telefone) payload.telefone = String(c.telefone);
  if (c.celular) payload.celular = String(c.celular);
  const tipoPessoa = c.tipo_pessoa
    ? String(c.tipo_pessoa)
    : String(c.cpf_cnpj ?? '').replace(/\D/g, '').length === 14 ? 'J' : 'F';
  payload.tipoPessoa = tipoPessoa;
  return payload;
}

async function syncContato(contatoId, token) {
  const [contato] = await sql`
    SELECT id_contato, nome, cpf_cnpj, email, telefone, celular, tipo_pessoa, id_api_contato
    FROM public.contatos WHERE id_contato = ${contatoId}
  `;
  if (!contato) throw new Error(`Contato ${contatoId} não encontrado`);

  const payload = buildContatoPayload(contato);
  console.log(`   Sincronizando "${contato.nome}" (cpf/cnpj: ${contato.cpf_cnpj || 'N/A'})...`);

  const res = await fetch('https://api.tiny.com.br/public-api/v3/contatos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const txt = await res.text();
    let msg = `Tiny ${res.status}: ${txt.slice(0, 200)}`;
    try {
      const j = JSON.parse(txt);
      const erros = Array.isArray(j.erros) ? j.erros.map(e => e.mensagem || e.campo || JSON.stringify(e)).join('; ') : '';
      msg = [j.message || j.error || j.mensagem, erros].filter(Boolean).join(' — ') || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const tinyId = data.id ?? data.data?.id;
  if (tinyId) {
    await sql`UPDATE public.contatos SET id_api_contato = ${tinyId} WHERE id_contato = ${contatoId}`;
    console.log(`   ✅ Contato criado no Tiny: #${tinyId}`);
    return tinyId;
  }
  throw new Error('Tiny não retornou ID do contato');
}

// ── ENVIAR VENDA ────────────────────────────────────────────────────────────────

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

  // Re-carregar cliente_id_tiny atualizado (após sync)
  const [contatoAtual] = await sql`
    SELECT id_api_contato FROM public.contatos WHERE id_contato = ${venda.cliente_id}
  `;
  const clienteIdTiny = Number(contatoAtual?.id_api_contato);

  const dataVenda = venda.data_venda ? new Date(venda.data_venda).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const pedidoV3 = {
    numeroPedido: numero_venda,
    idContato: clienteIdTiny,
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

// ═══════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════════

console.log('=== RESOLVENDO PEDIDOS PENDENTES ===\n');

let token = await ensureToken();

// ── 1. Buscar vendas problemáticas ──────────────────────────────────────────────

const vendasPendentes = await sql`
  SELECT v.id, v.numero_venda, v.situacao, v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_erro,
         v.cliente_id, v.vendedor_id, v.orcamento_id, v.data_venda, v.total_frete,
         v.observacoes, v.observacoes_internas,
         c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
         c.id_api_contato AS cliente_id_tiny,
         vd.id_api_vendedor AS vendedor_id_tiny
  FROM alissonerp.vendas_erp v
  LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
  LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
  WHERE v.numero_venda IN ('14978', '15068', '15079')
     OR v.id = 15870
  ORDER BY v.id
`;

// ── 2. Tratar 15870 (ID suspeito) ───────────────────────────────────────────────

const v15870 = vendasPendentes.find(v => v.id === 15870);
if (v15870) {
  console.log(`\n─── Tratando 15870 (numero_venda=${v15870.numero_venda}) ───`);
  console.log(`   Situação: ${v15870.situacao}, Tiny: ${v15870.tiny_pedido_id}, Status: ${v15870.tiny_sync_status}`);

  if (v15870.tiny_pedido_id) {
    console.log(`   Limpando tiny_pedido_id suspeito (${v15870.tiny_pedido_id})...`);
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_pedido_id = NULL, tiny_sync_status = 'pendente', tiny_sync_erro = NULL
      WHERE id = 15870
    `;
    v15870.tiny_pedido_id = null;
    v15870.tiny_sync_status = 'pendente';
  }
}

// ── 3. Sincronizar clientes sem Tiny ID ─────────────────────────────────────────

const semClienteTiny = vendasPendentes.filter(v => !Number(v.cliente_id_tiny));
if (semClienteTiny.length > 0) {
  console.log(`\n─── SINCRONIZANDO ${semClienteTiny.length} CLIENTES AO TINY ───\n`);

  for (const v of semClienteTiny) {
    if (!v.cliente_id) {
      console.log(`   ❌ ${v.numero_venda}: sem cliente_id`);
      continue;
    }
    try {
      const tinyId = await syncContato(v.cliente_id, token);
      v.cliente_id_tiny = tinyId;
      console.log(`   ✅ ${v.cliente_nome} (venda ${v.numero_venda}) → Tiny Contato #${tinyId}\n`);
    } catch (err) {
      console.log(`   ❌ ${v.cliente_nome || v.numero_venda}: ${err.message}\n`);
    }
  }
}

// ── 4. Reenviar pedidos pendentes ────────────────────────────────────────────────

const paraEnviar = vendasPendentes.filter(v => !v.tiny_pedido_id);
console.log(`─── ENVIANDO ${paraEnviar.length} PEDIDOS AO TINY ───\n`);

for (const v of paraEnviar) {
  if (!Number(v.cliente_id_tiny)) {
    console.log(`  ❌ ${v.numero_venda} (id=${v.id}): cliente "${v.cliente_nome}" ainda sem ID Tiny`);
    continue;
  }

  try {
    const result = await enviarVenda(v, token);
    if (result.token) token = result.token;
    console.log(`  ✅ ${v.numero_venda} (id=${v.id}) → Tiny #${result.tinyPedidoId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ❌ ${v.numero_venda} (id=${v.id}) → ${msg}`);
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status='erro', tiny_sync_at=NOW(), tiny_sync_erro=${msg.slice(0, 300)}
      WHERE id = ${v.id}
    `;
  }
}

console.log('\n=== CONCLUÍDO ===');
await sql.end();
