// ═══════════════════════════════════════════════════════════════════════════
// Helper compartilhado de transição de estado de vendas.
//
// Usado por:
//   - PATCH /api/vendas/[id] (aprovação/conclusão manual pela vendedora)
//   - POST /api/webhooks/mercado-pago (aprovação/conclusão automática ao
//     confirmar pagamento MP)
//
// Três funções públicas:
//   - sendToTiny(vendaId)        → envia venda pra API Tiny v3 (idempotente
//                                   via guard tiny_pedido_id)
//   - approveVenda(vendaId, uid) → rascunho → aprovado (dispara Tiny)
//   - concluirVenda(vendaId, uid)→ aprovado/rascunho → concluido
//                                   (cria ordem se vier de orçamento, marca CR)
//
// Idempotência é obrigatória: webhook MP reentrega a mesma notificação várias
// vezes. Se já processou, as funções retornam noop sem erro.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { verificarReposicaoAutomatica } from "@/lib/reposicao-automatica";
import { getDescontoThreshold } from "@/lib/aprovacao-regras";

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface VendaFull {
  id: number;
  numero_venda: string;
  situacao: string;
  cliente_id: number | null;
  vendedor_id: number | null;
  orcamento_id: number | null;
  data_venda: string | null;
  data_entrega: string | null;
  total_desconto: number;
  total_frete: number;
  observacoes: string | null;
  observacoes_internas: string | null;
  tiny_pedido_id: string | null;
  cliente_nome: string | null;
  cliente_cpf_cnpj: string | null;
  cliente_id_tiny: number | null;
  vendedor_id_tiny: number | null;
}

const SITUACAO_TINY: Record<string, number> = {
  rascunho: 0, aberto: 1, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2,
};

// ═══════════════════════════════════════════════════════════════════════════
// Tiny OAuth2 token refresh (extraído do PATCH /api/vendas/[id])
// ═══════════════════════════════════════════════════════════════════════════

async function readTinyToken(): Promise<string | null> {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!row?.valor_encrypted) return null;
  let token: string;
  try { token = JSON.parse(row.valor_encrypted); } catch { token = String(row.valor_encrypted); }
  return token.replace(/"/g, "").trim() || null;
}

async function refreshTinyToken(): Promise<string | null> {
  const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
  const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
  if (!ciRow?.valor_encrypted || !csRow?.valor_encrypted) return null;

  let clientId: string, clientSecret: string;
  try { clientId = JSON.parse(ciRow.valor_encrypted); } catch { clientId = String(ciRow.valor_encrypted); }
  try { clientSecret = JSON.parse(csRow.valor_encrypted); } catch { clientSecret = String(csRow.valor_encrypted); }
  clientId = clientId.replace(/"/g, "").trim();
  clientSecret = clientSecret.replace(/"/g, "").trim();

  const [rtRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_refresh_token'`;
  const attempts: URLSearchParams[] = [];
  if (rtRow?.valor_encrypted) {
    let rt: string;
    try { rt = JSON.parse(rtRow.valor_encrypted); } catch { rt = String(rtRow.valor_encrypted); }
    rt = rt.replace(/"/g, "").trim();
    if (rt) {
      attempts.push(new URLSearchParams({
        grant_type: "refresh_token", refresh_token: rt,
        client_id: clientId, client_secret: clientSecret,
      }));
    }
  }
  attempts.push(new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId, client_secret: clientSecret,
  }));

  for (const body of attempts) {
    try {
      const res = await fetch("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
      await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
      if (tokens.refresh_token) {
        await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}`;
      }
      if (tokens.expires_in) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_token_expires_at', ${JSON.stringify(expiresAt)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(expiresAt)}`;
      }
      return tokens.access_token;
    } catch { continue; }
  }
  return null;
}

export async function ensureTinyToken(): Promise<string> {
  let token = await readTinyToken();
  if (!token) {
    const refreshed = await refreshTinyToken();
    if (!refreshed) throw new Error("Token do Tiny não configurado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.");
    token = refreshed;
  }

  // Verificação proativa: token expira em < 10 min? Renova antes
  const [expiresRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_token_expires_at'
  `;
  if (expiresRow?.valor_encrypted) {
    let expiresAtIso: string;
    try { expiresAtIso = JSON.parse(expiresRow.valor_encrypted); } catch { expiresAtIso = String(expiresRow.valor_encrypted); }
    expiresAtIso = expiresAtIso.replace(/"/g, "").trim();
    const expiresAt = new Date(expiresAtIso);
    if (!isNaN(expiresAt.getTime()) && expiresAt.getTime() - Date.now() < 10 * 60 * 1000) {
      const newToken = await refreshTinyToken();
      if (newToken) {
        token = newToken;
      } else if (expiresAt.getTime() < Date.now()) {
        // Token já expirou E o refresh falhou — não adianta tentar enviar
        throw new Error("Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.");
      }
    }
  }

  return token;
}

// ═══════════════════════════════════════════════════════════════════════════
// sendToTiny — envia pedido pro Tiny (idempotente)
// ═══════════════════════════════════════════════════════════════════════════

export async function sendToTiny(vendaId: number): Promise<void> {
  // Idempotência: se já foi enviada, não reenvia
  const [venda] = await sql`
    SELECT v.id, v.numero_venda, v.cliente_id, v.vendedor_id, v.orcamento_id,
      v.data_venda, v.data_entrega, v.total_desconto, v.total_frete,
      v.observacoes, v.observacoes_internas, v.tiny_pedido_id,
      c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
      c.id_api_contato AS cliente_id_tiny,
      vd.id_api_vendedor AS vendedor_id_tiny
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.id = ${vendaId}
  ` as unknown as [VendaFull];

  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);
  if (venda.tiny_pedido_id) {
    // Já foi enviada — noop idempotente
    return;
  }

  let tinyToken = await ensureTinyToken();

  // Buscar itens + pagamentos
  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;
  const pagamentos = await sql`
    SELECT forma, valor, parcelas, gateway FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} ORDER BY id
  `;

  // Montar pagamento Tiny
  let tinyPagamento: Record<string, unknown> | null = null;
  if (pagamentos.length > 0) {
    const formaPag = pagamentos[0].forma;
    const [fpRow] = await sql`
      SELECT id_api_tiny FROM public.forma_pagamento WHERE descricao = ${formaPag} AND status = true LIMIT 1
    `;
    if (fpRow?.id_api_tiny) {
      tinyPagamento = { formaRecebimento: { id: Number(fpRow.id_api_tiny) } };
      const gateway = pagamentos[0].gateway;
      if (gateway) {
        const [mpRow] = await sql`
          SELECT mp.id_api_tiny FROM public.meio_pagamento mp
          JOIN public.forma_pagamento fp ON fp.id = mp.forma_pagamento_id
          WHERE fp.descricao = ${formaPag} AND mp.descricao = ${gateway} AND mp.status = true
          LIMIT 1
        `;
        if (mpRow?.id_api_tiny) {
          tinyPagamento.meioPagamento = { id: Number(mpRow.id_api_tiny) };
        }
      }
    }
  }

  const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
  const produtosTiny = produtoIds.length > 0 ? await sql`
    SELECT id_produto, id_api_produto FROM public.produtos WHERE id_produto = ANY(${produtoIds}) AND id_api_produto IS NOT NULL
  ` : [];
  const tinyIdMap = new Map(
    produtosTiny
      .filter(p => p.id_api_produto)
      .map(p => [Number(p.id_produto), Number(p.id_api_produto)])
  );

  // Validar antes de chamar a API — evita erro críptico do Tiny
  if (!Number(venda.cliente_id_tiny)) {
    const clienteNome = venda.cliente_nome || `ID ${venda.cliente_id}`;
    const msg = `Cliente "${clienteNome}" não está vinculado ao Tiny. Abra a ficha do cliente, adicione o ID Tiny e tente novamente.`;
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${msg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${msg}`);
  }

  const dataVenda = venda.data_venda
    ? new Date(venda.data_venda).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const pedidoV3: Record<string, unknown> = {
    numeroPedido: venda.numero_venda,
    idContato: Number(venda.cliente_id_tiny),
    situacao: SITUACAO_TINY["aberto"],
    data: dataVenda,
    ...(Number(venda.total_frete) > 0 ? { valorFrete: Number(venda.total_frete) } : {}),
    ...(venda.observacoes ? { observacoes: venda.observacoes } : {}),
    ...(venda.observacoes_internas ? { observacoesInternas: venda.observacoes_internas } : {}),
    ...(venda.vendedor_id_tiny ? { vendedor: { id: Number(venda.vendedor_id_tiny) } } : {}),
    ...(tinyPagamento ? { pagamento: tinyPagamento } : {}),
    itens: (() => {
      const isOrcamento = !!venda.orcamento_id;
      const TINY_PRODUTO_GENERICO = 746056974; // Aliança Personalizada

      if (!isOrcamento) {
        const semProduto = itens.filter(i => !i.produto_id || !tinyIdMap.has(Number(i.produto_id)));
        if (semProduto.length > 0) {
          throw new Error(`Produto "${semProduto[0].nome_produto}" não está cadastrado no Tiny. Vincule o produto antes de aprovar.`);
        }
      }

      return itens.map((item) => {
        const tinyProdId = tinyIdMap.get(Number(item.produto_id));
        const prodId = tinyProdId || (isOrcamento ? TINY_PRODUTO_GENERICO : 0);
        return {
          produto: {
            id: prodId,
            ...(item.sku ? { codigo: item.sku } : {}),
            descricao: item.nome_produto || "Produto",
            tipo: "P",
          },
          quantidade: Number(item.quantidade),
          valorUnitario: Number(item.preco_unitario),
          ...(item.observacao ? { infoAdicional: item.observacao } : {}),
        };
      });
    })(),
  };

  async function enviarParaTiny(token: string): Promise<Response> {
    return fetch("https://api.tiny.com.br/public-api/v3/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(pedidoV3),
      signal: AbortSignal.timeout(15000),
    });
  }

  let tinyRes: Response;
  try {
    tinyRes = await enviarParaTiny(tinyToken);
    if (tinyRes.status === 401) {
      const newToken = await refreshTinyToken();
      if (newToken) {
        tinyToken = newToken;
        tinyRes = await enviarParaTiny(tinyToken);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha na comunicação com o Tiny";
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${msg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${msg}`);
  }

  if (!tinyRes.ok) {
    const errBody = await tinyRes.text();
    let erroMsg = "";
    if (tinyRes.status === 401) {
      erroMsg = "Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'.";
    } else {
      erroMsg = `Tiny API ${tinyRes.status}`;
      try {
        const errJson = JSON.parse(errBody);
        const msg = errJson.message || errJson.error || errJson.descricao || errJson.mensagem || "";
        const erros = Array.isArray(errJson.erros)
          ? errJson.erros.map((e: Record<string, string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
          : Array.isArray(errJson.detalhes)
          ? errJson.detalhes.map((e: Record<string, string>) => `${e.campo}: ${e.mensagem}`).join("; ")
          : "";
        erroMsg = [msg, erros].filter(Boolean).join(" — ") || `${erroMsg}: ${JSON.stringify(errJson).slice(0, 300)}`;
      } catch { erroMsg += errBody ? `: ${errBody.slice(0, 300)}` : ""; }
    }
    await sql`
      UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
      WHERE id = ${vendaId}
    `;
    throw new Error(`${erroMsg}`);
  }

  const tinyData = await tinyRes.json() as { id?: number; numeroPedido?: string };
  await sql`
    UPDATE alissonerp.vendas_erp SET
      tiny_pedido_id   = ${String(tinyData.id ?? "")},
      tiny_sync_status = 'sincronizado',
      tiny_sync_at     = NOW(),
      tiny_sync_erro   = NULL
    WHERE id = ${vendaId}
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Criação automática de ordem a partir de orçamento (extraído do PATCH)
// ═══════════════════════════════════════════════════════════════════════════

export async function criarOrdemDoOrcamento(
  vendaId: number,
  userId: string
): Promise<{ id: number; numero_ordem: string } | null> {
  const [vendaOrc] = await sql`
    SELECT v.orcamento_id, v.cliente_id, v.vendedor_id, v.data_entrega,
           v.numero_venda,
           o.id AS orc_id, o.tipo, o.peso, o.numero_orcamento, o.nome_modelo,
           o.foto_3d, o.ficha_tecnica_id, o.ficha_tecnica_2_id, o.quantidade,
           o.ordem_gerada_id,
           ft.perfil, ft.modelo, ft.aro_numeracao, ft.largura, ft.espessura,
           ft.peso_estimado, ft.densidade_ouro, ft.cor_metal,
           ft.tipo_fonte, ft.texto, ft.qtd_pedras, ft.tamanho_pedra,
           ft.tipo_aplicacao_pedra, ft.pedras_detalhadas
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.orcamentos o ON o.id = v.orcamento_id
    LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
    WHERE v.id = ${vendaId} AND v.orcamento_id IS NOT NULL
  `;
  if (!vendaOrc?.orc_id) return null;
  if (vendaOrc.ordem_gerada_id) {
    // Ordem já foi criada — idempotente
    const [existente] = await sql`
      SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${vendaOrc.ordem_gerada_id}
    `;
    if (existente) return { id: Number(existente.id), numero_ordem: String(existente.numero_ordem) };
    return null;
  }

  let ordemCriada: { id: number; numero_ordem: string } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // C3: Lock no orçamento para evitar criação de ordens duplicadas em retries simultâneos
    const [orcLock] = await tx`
      SELECT id, ordem_gerada_id FROM alissonerp.orcamentos WHERE id = ${vendaOrc.orc_id} FOR UPDATE
    `;
    if (orcLock?.ordem_gerada_id) {
      const [existenteTx] = await tx`
        SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${orcLock.ordem_gerada_id}
      `;
      if (existenteTx) {
        ordemCriada = { id: Number(existenteTx.id), numero_ordem: String(existenteTx.numero_ordem) };
        return;
      }
    }

    const perfilNomes: Record<string, string> = {
      Anatomica: "Anatômica", Boleada: "Boleada", BoleadaDouble: "Boleada Dupla",
      Chanfrada: "Chanfrada", Concava: "Côncava", FrisoUnico: "Friso Único",
      FrisoLateral: "Friso Lateral", QuadradoCanal: "Quadrado Canal", Simples: "Reta",
    };

    const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
    const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");
    const isPar = Number(vendaOrc.quantidade) === 2;
    const pesoItem1 = Number(vendaOrc.peso_estimado ?? vendaOrc.peso ?? 0);
    const pesoNeg = Number(vendaOrc.peso ?? vendaOrc.peso_estimado ?? 0);

    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota,
        cliente_id, vendedor_id, peso_metal_negociado,
        data_entrega, detalhes_ordem, foto_peca_servico, venda_id,
        numero_pedido, created_at
      ) VALUES (
        ${numeroOrdem}, 'fabricacao'::alissonerp.enum_tipo_ordem,
        'criado', 'aguardando', 'pcp',
        ${vendaOrc.cliente_id}, ${vendaOrc.vendedor_id},
        ${pesoNeg}, ${vendaOrc.data_entrega},
        ${'Venda #' + vendaOrc.numero_venda + ' / Orçamento ' + vendaOrc.numero_orcamento + (isPar ? ' (Par)' : '')},
        ${vendaOrc.foto_3d ?? null}, ${vendaId},
        ${vendaOrc.numero_venda ?? null}, NOW()
      ) RETURNING id, numero_ordem
    `;
    ordemCriada = { id: Number(ordem.id), numero_ordem: String(ordem.numero_ordem) };

    const nomeItem = vendaOrc.tipo === "alianca"
      ? `${isPar ? "Aliança 1 - " : "Aliança "}${perfilNomes[vendaOrc.perfil as string] ?? vendaOrc.modelo ?? "Personalizada"}`
      : `Peça Personalizada`;
    await tx`
      INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
      VALUES (${ordem.id}, ${nomeItem}, 1, ${pesoItem1})
    `;

    const tipoItem = vendaOrc.tipo === "alianca" ? "alianca" : "peca_personalizada";
    const dadosFicha: Record<string, unknown> = {};
    if (vendaOrc.tipo === "alianca") {
      if (vendaOrc.largura) dadosFicha.milimetragem = String(vendaOrc.largura);
      if (vendaOrc.aro_numeracao) dadosFicha.numeracao = String(vendaOrc.aro_numeracao).replace("Aro ", "");
      const pf = perfilNomes[vendaOrc.perfil as string] ?? vendaOrc.modelo ?? vendaOrc.perfil;
      if (pf) dadosFicha.modelo = pf;
      if (vendaOrc.tipo_fonte) dadosFicha.tipo_fonte = vendaOrc.tipo_fonte;
      if (vendaOrc.texto) dadosFicha.texto_gravacao = vendaOrc.texto;
      if (vendaOrc.cor_metal) dadosFicha.cor_metal = vendaOrc.cor_metal;
      if (vendaOrc.peso_estimado) dadosFicha.peso_estimado = vendaOrc.peso_estimado;
      if (vendaOrc.espessura) dadosFicha.espessura = vendaOrc.espessura;
      if (vendaOrc.qtd_pedras) dadosFicha.qtd_pedras = vendaOrc.qtd_pedras;
      if (vendaOrc.tamanho_pedra) dadosFicha.tamanho_pedra = vendaOrc.tamanho_pedra;
      if (vendaOrc.tipo_aplicacao_pedra) dadosFicha.tipo_aplicacao_pedra = vendaOrc.tipo_aplicacao_pedra;
    } else {
      if (vendaOrc.peso_estimado) dadosFicha.peso_estimado = vendaOrc.peso_estimado;
      if (vendaOrc.cor_metal) dadosFicha.cor_metal = vendaOrc.cor_metal;
      if (vendaOrc.pedras_detalhadas) dadosFicha.pedras_detalhadas = vendaOrc.pedras_detalhadas;
    }
    await tx`
      INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
      VALUES (${ordem.id}, ${tipoItem}, ${JSON.stringify(dadosFicha)}::jsonb, ${userId}::uuid)
    `;

    if (Number(vendaOrc.quantidade) === 2 && vendaOrc.ficha_tecnica_2_id) {
      const [ft2] = await tx`
        SELECT perfil, modelo, aro_numeracao, largura, espessura, peso_estimado,
               densidade_ouro, cor_metal, tipo_fonte, texto, qtd_pedras, tamanho_pedra,
               tipo_aplicacao_pedra, pedras_detalhadas
        FROM alissonerp.orcamento_fichas_tecnicas WHERE id = ${vendaOrc.ficha_tecnica_2_id}
      `;
      if (ft2) {
        const nomeItem2 = `Aliança 2 - ${perfilNomes[ft2.perfil as string] ?? ft2.modelo ?? "Personalizada"}`;
        const peso2 = Number(ft2.peso_estimado ?? 0);
        await tx`
          INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
          VALUES (${ordem.id}, ${nomeItem2}, 1, ${peso2})
        `;
        const dadosFicha2: Record<string, unknown> = {};
        if (ft2.largura) dadosFicha2.milimetragem = String(ft2.largura);
        if (ft2.aro_numeracao) dadosFicha2.numeracao = String(ft2.aro_numeracao).replace("Aro ", "");
        const pf2 = perfilNomes[ft2.perfil as string] ?? ft2.modelo ?? ft2.perfil;
        if (pf2) dadosFicha2.modelo = pf2;
        if (ft2.tipo_fonte) dadosFicha2.tipo_fonte = ft2.tipo_fonte;
        if (ft2.texto) dadosFicha2.texto_gravacao = ft2.texto;
        if (ft2.cor_metal) dadosFicha2.cor_metal = ft2.cor_metal;
        if (ft2.peso_estimado) dadosFicha2.peso_estimado = ft2.peso_estimado;
        if (ft2.espessura) dadosFicha2.espessura = ft2.espessura;
        if (ft2.qtd_pedras) dadosFicha2.qtd_pedras = ft2.qtd_pedras;
        if (ft2.tamanho_pedra) dadosFicha2.tamanho_pedra = ft2.tamanho_pedra;
        if (ft2.tipo_aplicacao_pedra) dadosFicha2.tipo_aplicacao_pedra = ft2.tipo_aplicacao_pedra;
        await tx`
          INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
          VALUES (${ordem.id}, 'alianca', ${JSON.stringify(dadosFicha2)}::jsonb, ${userId}::uuid)
        `;
      }
    }

    // Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja
    // (migration 186) — não inserir manualmente para evitar unique constraint violation

    await tx`
      UPDATE alissonerp.orcamentos
      SET ordem_gerada_id = ${ordem.id}, updated_at = NOW()
      WHERE id = ${vendaOrc.orc_id}
    `;
  });

  return ordemCriada;
}

// ═══════════════════════════════════════════════════════════════════════════
// Criação automática de ordem de serviço (tipo_venda = 'servico')
// ═══════════════════════════════════════════════════════════════════════════

export async function criarOrdemDeServico(
  vendaId: number,
): Promise<{ id: number; numero_ordem: string } | null> {
  const [venda] = await sql`
    SELECT id, tipo_venda, orcamento_id, cliente_id, vendedor_id,
           data_entrega, numero_venda
    FROM alissonerp.vendas_erp
    WHERE id = ${vendaId} AND tipo_venda = 'servico' AND orcamento_id IS NULL
  `;
  if (!venda) return null;

  const itens = await sql`
    SELECT produto_id, nome_produto, sku, quantidade, observacao
    FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
  `;

  let ordemCriada: { id: number; numero_ordem: string } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sql as any).begin(async (tx: typeof sql) => {
    // C3: Lock na venda para evitar criação de ordens duplicadas em requests simultâneos
    await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;

    // Idempotência dentro da tx: re-verifica após adquirir lock
    const [existenteTx] = await tx`
      SELECT id, numero_ordem FROM alissonerp.ordens WHERE venda_id = ${vendaId} LIMIT 1
    `;
    if (existenteTx) {
      ordemCriada = { id: Number(existenteTx.id), numero_ordem: String(existenteTx.numero_ordem) };
      return;
    }

    const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
    const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
    const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
    const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");

    const detalhes = itens.map((i) => i.nome_produto).filter(Boolean).join(", ")
      || `Venda V-${String(vendaId).padStart(5, "0")}`;

    const [ordem] = await tx`
      INSERT INTO alissonerp.ordens (
        numero_ordem, tipo_ordem, situacao, status, rota,
        cliente_id, vendedor_id, data_entrega, detalhes_ordem,
        venda_id, numero_pedido, created_at
      ) VALUES (
        ${numeroOrdem},
        'servico_venda'::alissonerp.enum_tipo_ordem,
        'criado', 'aguardando', 'protocolo',
        ${venda.cliente_id ?? null},
        ${venda.vendedor_id ?? null},
        ${venda.data_entrega ?? null},
        ${detalhes},
        ${vendaId},
        ${venda.numero_venda ?? null},
        NOW()
      ) RETURNING id, numero_ordem
    `;
    ordemCriada = { id: Number(ordem.id), numero_ordem: String(ordem.numero_ordem) };

    for (const item of itens) {
      await tx`
        INSERT INTO alissonerp.itens_ordem (ordem_id, produto_id, nome_produto, sku, quantidade)
        VALUES (
          ${ordem.id},
          ${item.produto_id ?? null},
          ${item.nome_produto},
          ${item.sku ?? null},
          ${Number(item.quantidade)}
        )
      `;
    }

    // Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja
  });

  return ordemCriada;
}

// ═══════════════════════════════════════════════════════════════════════════
// approveVenda — rascunho → aprovado (dispara Tiny)
//
// opts.tinyBestEffort: se true, falha do Tiny NÃO impede a aprovação. Erro
// é salvo em tiny_sync_erro e a venda segue pra aprovado normalmente. Usado
// pelo webhook MP — pagamento confirmado pelo banco não deve ficar refém
// do estado da integração Tiny (que pode ter token expirado, etc).
// ═══════════════════════════════════════════════════════════════════════════

export interface ApproveVendaOpts {
  tinyBestEffort?: boolean;
}

export async function approveVenda(
  vendaId: number,
  userId: string,
  opts: ApproveVendaOpts = {}
): Promise<{ ok: true; ordem_criada?: string; ja_aprovada?: boolean; tiny_erro?: string }> {
  const approveVendaThreshold = await getDescontoThreshold(vendaId);
  const [venda] = await sql`
    SELECT v.id, v.situacao, v.bloqueado, v.tiny_pedido_id,
           v.desconto_aprovado_por,
           EXISTS(
             SELECT 1 FROM alissonerp.itens_venda_erp
             WHERE venda_id = ${vendaId} AND pct_desconto > ${approveVendaThreshold}
           ) AS tem_desconto_alto
    FROM alissonerp.vendas_erp v WHERE v.id = ${vendaId}
  `;
  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);
  if (venda.bloqueado) throw new Error("Venda bloqueada");

  // Idempotência: já aprovada ou concluída
  if (venda.situacao === "aprovado" || venda.situacao === "concluido" || venda.situacao === "confirmado") {
    return { ok: true, ja_aprovada: true };
  }

  // ── Bloquear aprovação se cartão foi liberado mas sem pagamento ainda ────
  const [cartaoBlock] = await sql`
    SELECT
      (SELECT desconto_cartao_aprovado_por FROM alissonerp.vendas_erp WHERE id = ${vendaId}) IS NOT NULL AS cartao_ja_liberado,
      EXISTS(SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} AND pct_desconto > 20) AS tem_desconto_cartao,
      EXISTS(SELECT 1 FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} AND status = 'confirmado') AS tem_pagamento_confirmado
  `;
  if (cartaoBlock?.cartao_ja_liberado && cartaoBlock?.tem_desconto_cartao && !cartaoBlock?.tem_pagamento_confirmado) {
    console.log(`[approveVenda] SKIP venda=${vendaId}: cartão liberado pela trigger, sem pagamentos confirmados ainda`);
    return { ok: true, ja_aprovada: true };
  }

  // ── Bloquear aprovação se desconto > threshold não aprovado ──────────────
  if (venda.tem_desconto_alto && !venda.desconto_aprovado_por) {
    console.error(`[approveVenda] BLOQUEADO venda=${vendaId}: desconto >${approveVendaThreshold}% sem aprovação (desconto_aprovado_por=NULL)`);
    await sql`
      INSERT INTO alissonerp.webhook_log (webhook_nome, payload, response_status, erro)
      VALUES ('approveVenda_bloqueado', ${JSON.stringify({ vendaId, userId, motivo: "desconto_pendente" })}::text::jsonb, 409, 'desconto >${approveVendaThreshold}% sem aprovação')
    `.catch(() => {});
    throw new Error(`Venda tem desconto acima de ${approveVendaThreshold}% aguardando aprovação. Solicite aprovação de desconto antes de prosseguir.`);
  }

  // 1. Envia pro Tiny (noop se tiny_pedido_id já existe)
  let tinyErro: string | undefined;
  try {
    await sendToTiny(vendaId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (opts.tinyBestEffort) {
      console.error(`[approveVenda] Tiny falhou mas tinyBestEffort=true, continuando: ${msg}`);
      tinyErro = msg;
      // sendToTiny já grava tiny_sync_erro no banco antes do throw
    } else {
      throw err;
    }
  }

  // 2. Atualiza situação para aprovado
  await sql`
    UPDATE alissonerp.vendas_erp
    SET situacao = 'aprovado', updated_at = NOW()
    WHERE id = ${vendaId} AND situacao NOT IN ('aprovado', 'concluido', 'confirmado', 'cancelado')
  `;

  // 3. Criar ordem (orçamento ou serviço) — best-effort
  let ordemCriada: string | undefined;
  try {
    const ordem = await criarOrdemDoOrcamento(vendaId, userId);
    if (ordem) ordemCriada = ordem.numero_ordem;
  } catch (err) {
    console.error(`[approveVenda] Erro ao criar ordem (orcamento) p/ venda ${vendaId}:`, err);
  }
  if (!ordemCriada) {
    try {
      const ordemSvc = await criarOrdemDeServico(vendaId);
      if (ordemSvc) ordemCriada = ordemSvc.numero_ordem;
    } catch (err) {
      console.error(`[approveVenda] Erro ao criar ordem (servico) p/ venda ${vendaId}:`, err);
    }
  }

  // 4. Reposição automática — aprovação NÃO baixa estoque comercial.
  //    Itens da venda mantêm reserva ativa; a saída efetivada ocorre somente
  //    quando a venda muda para `entregue`. Aqui verificamos reposição de forma
  //    best-effort para antecipar falta sem bloquear a aprovação.
  try {
    const itensProdutos = await sql`
      SELECT DISTINCT produto_id
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${vendaId} AND produto_id IS NOT NULL
    `;
    const produtoIds = itensProdutos.map((r) => Number(r.produto_id));
    if (produtoIds.length > 0) {
      await verificarReposicaoAutomatica({ userId, produtoIds });
    }
  } catch (err) {
    console.error(`[approveVenda] Reposição automática falhou (não-bloqueante) p/ venda ${vendaId}:`, err);
  }

  // 5. Registrar metal de upgrade no cofre_ouro_rastreios (na aprovação)
  // REGRA DE NEGÓCIO (Produto Upgrade): o metal do cliente só entra no cofre
  // quando a venda é aprovada. Enquanto rascunho, o metal não é da empresa.
  // cofre_registrado = true impede dupla entrada (idempotência).
  try {
    const [upgradeVenda] = await sql`
      SELECT ve.numero_venda
      FROM alissonerp.vendas_erp ve WHERE ve.id = ${vendaId}
    `;

    const upgradeItens = await sql`
      SELECT iuv.item_venda_id, iuv.peso_gramas, iuv.foto_balanca_path,
             ive.sku, ive.nome_produto
      FROM alissonerp.itens_venda_upgrade iuv
      JOIN alissonerp.itens_venda_erp ive ON ive.id = iuv.item_venda_id
      WHERE ive.venda_id = ${vendaId}
        AND iuv.cofre_registrado = false
    `;

    for (const item of upgradeItens) {
      const gramas = Number(item.peso_gramas);
      const origemNome = `Upgrade Venda ${String(upgradeVenda?.numero_venda ?? vendaId)} — ${String(item.sku ?? item.nome_produto ?? "")}`;

      await sql`
        INSERT INTO alissonerp.cofre_ouro_rastreios
          (evento, gramas, origem_nome, observacao, created_at)
        VALUES
          ('entrada_upgrade', ${gramas}, ${origemNome},
           ${`Upgrade venda ${String(upgradeVenda?.numero_venda ?? vendaId)}`},
           NOW())
      `;
    }

    if (upgradeItens.length > 0) {
      await sql`
        UPDATE alissonerp.itens_venda_upgrade iuv
        SET cofre_registrado = true
        FROM alissonerp.itens_venda_erp ive
        WHERE ive.id = iuv.item_venda_id
          AND ive.venda_id = ${vendaId}
          AND iuv.cofre_registrado = false
      `;
    }
  } catch (err) {
    console.error(`[approveVenda] Erro ao registrar upgrade no cofre p/ venda ${vendaId}:`, err);
    // best-effort: venda ja foi aprovada, metal pode ser reconciliado depois
  }

  return {
    ok: true,
    ...(ordemCriada ? { ordem_criada: ordemCriada } : {}),
    ...(tinyErro ? { tiny_erro: tinyErro } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// concluirVenda — {rascunho, aprovado} → concluido
//
// ORDEM CRÍTICA (local-first, commit-then-sync):
//
//   1. UPDATE vendas_erp.situacao = 'concluido'
//      → trigger 113 cria contas_receber automaticamente
//   2. fn_cr_marcar_pago_mp → marca CR como recebida
//   3. criarOrdemDoOrcamento → cria ordem de fabricação se orçamento (best-effort)
//   4. sendToTiny → sincroniza com Tiny ERP (best-effort)
//
// Filosofia: o pagamento já foi confirmado pelo banco/Mercado Pago. O
// "fechamento" da venda no nosso sistema é inegociável — não pode ser
// bloqueado por uma integração downstream como o Tiny. Se o Tiny estiver
// fora (token expirado, rede, etc), a venda permanece concluída e o erro
// é salvo em tiny_sync_erro pra ser reenviado manualmente depois.
//
// Esse helper NÃO chama approveVenda. Mesmo quando venda está em rascunho,
// pula direto pra 'concluido' (o trigger 114 de blindagem só dispara
// quando OLD.situacao IN ('confirmado','concluido'), então rascunho→concluido
// passa limpo).
//
// opts.tinyBestEffort:
//   - true (webhook MP): erro Tiny NÃO propaga. Retorna tiny_erro no result.
//   - false/undefined (fluxo manual futuro): retorna tiny_erro mas também
//     não propaga, porque a venda JÁ está concluída e reverter seria pior.
//     O caller vê o tiny_erro no retorno e decide mostrar pro usuário.
// ═══════════════════════════════════════════════════════════════════════════

export async function concluirVenda(
  vendaId: number,
  userId: string,
  opts: ApproveVendaOpts = {}
): Promise<{
  ok: true;
  ordem_criada?: string;
  ja_concluida?: boolean;
  cr_quitadas?: number;
  tiny_erro?: string;
}> {
  void opts; // reservado pra extensões futuras; hoje Tiny sempre é best-effort

  const [venda] = await sql`
    SELECT id, situacao, bloqueado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) throw new Error(`Venda ${vendaId} não encontrada`);
  if (venda.bloqueado) throw new Error("Venda bloqueada");

  if (venda.situacao === "concluido") {
    return { ok: true, ja_concluida: true };
  }
  if (venda.situacao === "cancelado") {
    throw new Error("Venda cancelada não pode ser concluída");
  }

  // ── 0. GUARD: verificar cobertura total de pagamentos ───────────────────
  // Checar pendentes E se a soma dos confirmados realmente cobre o total_venda.
  // data_confirmacao IS NOT NULL garante que só pagamentos com confirmação real
  // (webhook, verificar-manual, confirmar endpoint) entram no cálculo —
  // preferences fantasma (status='confirmado' sem data_confirmacao) são excluídas.
  const [pagCheck] = await sql`
    SELECT
      v.total_venda::numeric AS total_venda,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pendente'), 0)::numeric AS soma_pendentes,
      COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS soma_confirmados
    FROM alissonerp.vendas_erp v
    LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
    WHERE v.id = ${vendaId}
    GROUP BY v.total_venda
  `;
  if (Number(pagCheck?.soma_pendentes ?? 0) > 0) {
    throw new Error(
      "Venda possui pagamentos pendentes. Confirme todos os pagamentos antes de concluir.",
    );
  }
  const somaConfirmada = Number(pagCheck?.soma_confirmados ?? 0);
  const totalVendaCheck = Number(pagCheck?.total_venda ?? 0);
  if (somaConfirmada < totalVendaCheck - 0.01) {
    throw new Error(
      `Pagamento insuficiente: R$${somaConfirmada.toFixed(2)} confirmados de R$${totalVendaCheck.toFixed(2)} devidos. Registre o pagamento completo antes de concluir.`,
    );
  }

  // ── 1. FECHAMENTO FINANCEIRO ─────────────────────────────────────────────
  // Transição pra concluido. Trigger 113 (fn_venda_gerar_conta_receber)
  // cria contas_receber automaticamente.
  await sql`
    UPDATE alissonerp.vendas_erp
    SET situacao = 'concluido', updated_at = NOW()
    WHERE id = ${vendaId} AND situacao NOT IN ('concluido', 'cancelado')
  `;

  // ── 2. MARCAR CONTAS_RECEBER COMO RECEBIDAS ──────────────────────────────
  // M5: Se a função falhar (CR já cancelada, etc), a venda continua concluída
  let crQuitadas: unknown = 0;
  try {
    const [crResult] = await sql`
      SELECT alissonerp.fn_cr_marcar_pago_mp(${vendaId}) AS fn_cr_marcar_pago_mp
    `;
    crQuitadas = crResult?.fn_cr_marcar_pago_mp;
  } catch (err) {
    console.error(`[concluirVenda] fn_cr_marcar_pago_mp falhou p/ venda ${vendaId}:`, err);
  }

  // ── 3. CRIAR ORDEM (orçamento ou serviço) — best-effort ─────────────────
  let ordemCriada: string | undefined;
  try {
    const ordem = await criarOrdemDoOrcamento(vendaId, userId);
    if (ordem) ordemCriada = ordem.numero_ordem;
  } catch (err) {
    console.error(`[concluirVenda] Erro ao criar ordem (orcamento) p/ venda ${vendaId}:`, err);
  }
  if (!ordemCriada) {
    try {
      const ordemSvc = await criarOrdemDeServico(vendaId);
      if (ordemSvc) ordemCriada = ordemSvc.numero_ordem;
    } catch (err) {
      console.error(`[concluirVenda] Erro ao criar ordem (servico) p/ venda ${vendaId}:`, err);
    }
  }

  // ── 4. SINCRONIZAR COM TINY (best-effort, DEPOIS do fechamento) ──────────
  let tinyErro: string | undefined;
  try {
    await sendToTiny(vendaId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    tinyErro = msg;
    console.error(`[concluirVenda] Tiny falhou p/ venda ${vendaId}, venda continua concluída: ${msg}`);
    // sendToTiny já gravou tiny_sync_erro no banco antes do throw.
    // A venda está fechada e a CR paga; o Tiny pode ser reenviado manualmente.
  }

  return {
    ok: true,
    ...(ordemCriada ? { ordem_criada: ordemCriada } : {}),
    ...(tinyErro ? { tiny_erro: tinyErro } : {}),
    cr_quitadas: Number(crQuitadas ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// estornarVenda — reverte pagamento confirmado (refund / cancelamento / chargeback)
//
// Regras de negócio (definidas pelo Jonathan):
//   - Se a venda TINHA outros pagamentos confirmados além do que foi estornado:
//       → venda volta pra 'rascunho' (vendedora recobra o valor estornado)
//   - Se esse era o ÚNICO pagamento confirmado:
//       → venda vai pra 'cancelado' (trigger 111 reverte estoque comercial
//          automaticamente)
//
// Em ambos os casos:
//   - pagamentos_venda.status → 'estornado' (o pagamento estornado)
//   - contas_receber em 'pago' ou 'pendente' → 'cancelado' (manual, porque
//     trigger 113 só cancela CR pendente via situacao, e nossa CR foi marcada
//     como 'pago' pelo fn_cr_marcar_pago_mp)
//
// Idempotente: se pagamento já está 'estornado', retorna { ja_estornado: true }.
//
// Usado pelo webhook MP quando o status do payment MP vira refunded, cancelled
// (após confirmado) ou charged_back.
// ═══════════════════════════════════════════════════════════════════════════

export type EstornoAcao = "cancelada" | "revertida_rascunho" | "ja_estornado";

export interface EstornarVendaResult {
  ok: true;
  acao: EstornoAcao;
  outros_confirmados: number;
  cr_canceladas: number;
}

export async function estornarVenda(
  vendaId: number,
  pagamentoId: number,
  motivoPayload: Record<string, unknown>
): Promise<EstornarVendaResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (sql as any).begin(async (tx: typeof sql): Promise<EstornarVendaResult> => {
    // 1. Bloqueia pagamento + venda para evitar race entre dois estornos simultâneos
    await tx`SELECT id FROM alissonerp.vendas_erp WHERE id = ${vendaId} FOR UPDATE`;
    const [pag] = await tx`
      SELECT id, venda_id, status, gateway_payload
      FROM alissonerp.pagamentos_venda
      WHERE id = ${pagamentoId} AND venda_id = ${vendaId}
      FOR UPDATE
    `;
    if (!pag) throw new Error(`Pagamento ${pagamentoId} não encontrado na venda ${vendaId}`);

    // Idempotência: já estornado anteriormente
    if (pag.status === "estornado") {
      return { ok: true, acao: "ja_estornado", outros_confirmados: 0, cr_canceladas: 0 };
    }

    // 2. Conta outros pagamentos confirmados (excluindo esse)
    const [{ outros_confirmados }] = await tx`
      SELECT COUNT(*)::int AS outros_confirmados
      FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId}
        AND id != ${pagamentoId}
        AND status = 'confirmado'
    `;
    const nOutros = Number(outros_confirmados);

    // 3. Marca o pagamento como estornado + guarda motivo
    const payloadAntigo = (pag.gateway_payload as Record<string, unknown> | null) ?? {};
    const novoPayload = {
      ...payloadAntigo,
      ...motivoPayload,
      estornado_em: new Date().toISOString(),
    };
    await tx`
      UPDATE alissonerp.pagamentos_venda
      SET
        status          = 'estornado',
        gateway_payload = ${JSON.stringify(novoPayload)}::jsonb
      WHERE id = ${pagamentoId}
    `;

    // 4. Decide ação sobre a venda
    let acao: EstornoAcao;
    if (nOutros > 0) {
      // Ainda há outros pagamentos confirmados → volta pra rascunho
      // pra vendedora recobrar o valor estornado (ou cancelar manualmente)
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'rascunho', updated_at = NOW()
        WHERE id = ${vendaId} AND situacao NOT IN ('cancelado')
      `;
      acao = "revertida_rascunho";
    } else {
      // Era a única forma de pagamento → cancela venda totalmente.
      // Trigger 111 (fn_estoque_comercial_cancelamento_venda) reverte o
      // estoque comercial automaticamente em BEFORE UPDATE.
      await tx`
        UPDATE alissonerp.vendas_erp
        SET situacao = 'cancelado', updated_at = NOW()
        WHERE id = ${vendaId} AND situacao NOT IN ('cancelado')
      `;
      acao = "cancelada";
    }

    // 5. Cancela contas_receber dessa venda.
    // Trigger 113 (fn_venda_cancelar_conta_receber) só age em CR 'pendente',
    // mas a nossa CR foi marcada como 'pago' pelo fn_cr_marcar_pago_mp. Então
    // fazemos UPDATE manual abrangendo 'pendente' + 'pago'.
    const crResult = await tx`
      UPDATE alissonerp.contas_receber
      SET situacao = 'cancelado', updated_at = NOW()
      WHERE venda_erp_id = ${vendaId}
        AND situacao IN ('pago', 'pendente')
      RETURNING id
    `;

    return {
      ok: true,
      acao,
      outros_confirmados: nOutros,
      cr_canceladas: crResult.length,
    };
  });
}
