import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/[id] ──────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT
      v.id, v.numero_venda,
      v.cliente_id, v.cliente_nome, v.cliente_cpf_cnpj, v.cliente_email, v.cliente_telefone,
      v.vendedor_id, v.vendedor_nome,
      v.data_venda, v.data_entrega,
      v.total_produtos, v.total_desconto, v.total_frete, v.total_venda, v.total_comissao,
      v.situacao, v.forma_envio, v.forma_frete,
      v.observacoes, v.observacoes_internas, v.video_obs_interna,
      v.tiny_pedido_id, v.tiny_sync_status, v.tiny_sync_at, v.tiny_sync_erro,
      v.bloqueado, v.created_by, v.created_at, v.updated_at,
      v.qtd_itens, v.total_pago,
      ve.endereco_entrega, ve.endereco_entrega_numero, ve.endereco_entrega_complemento,
      ve.endereco_entrega_bairro, ve.endereco_entrega_cidade, ve.endereco_entrega_cep, ve.endereco_entrega_uf,
      ve.credito_gerente_usado, ve.aprovacao_credito_tipo, ve.aprovacao_credito_tarefa_id,
      (SELECT t.status FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_credito_status,
      (SELECT t.tags FROM alissonerp.tarefas t WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_tarefa_tags,
      (SELECT u.nome FROM alissonerp.tarefas t JOIN alissonerp.usuarios u ON u.id = t.responsavel_id WHERE t.id = ve.aprovacao_credito_tarefa_id) AS aprovacao_credito_responsavel_nome,
      (SELECT at.id FROM alissonerp.aprovacoes_tarefa at WHERE at.tarefa_id = ve.aprovacao_credito_tarefa_id AND at.status = 'pendente' LIMIT 1) AS aprovacao_desconto_aprov_id,
      ve.desconto_aprovado_por,
      ve.desconto_aprovado_em,
      (SELECT u.nome FROM alissonerp.usuarios u WHERE u.id = ve.desconto_aprovado_por) AS desconto_aprovado_por_nome,
      c.endereco AS cliente_endereco, c.numero AS cliente_numero, c.complemento AS cliente_complemento,
      c.bairro AS cliente_bairro, c.municipio AS cliente_municipio, c.cep AS cliente_cep, c.uf AS cliente_uf,
      c.id_api_contato AS cliente_id_tiny
    FROM alissonerp.vw_vendas_erp_completa v
    LEFT JOIN alissonerp.vendas_erp ve ON ve.id = v.id
    LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
    WHERE v.id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  const itens = await sql`
    SELECT
      id, produto_id, nome_produto, sku,
      quantidade,
      preco_lista, pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao,
      desconto_autorizado_por, observacao, peso_estimado, personalizacao, created_at
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const pagamentos = await sql`
    SELECT
      id, forma, gateway, valor, parcelas,
      status, gateway_id, data_confirmacao, created_at,
      valor_liquido, taxas_mp
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const ordens = await sql`
    SELECT id, numero_ordem, tipo_ordem, situacao, status, created_at
    FROM alissonerp.ordens
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const devolucoes = await sql`
    SELECT id, numero, tipo, status, tipo_compensacao,
           valor_total_devolvido, valor_compensacao, created_at
    FROM alissonerp.devolucoes_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id DESC
  `;

  return NextResponse.json({
    ...venda,
    devolucoes: devolucoes.map((d) => ({
      ...d,
      valor_total_devolvido: Number(d.valor_total_devolvido),
      valor_compensacao: Number(d.valor_compensacao),
    })),
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete:    Number(venda.total_frete),
    total_venda:    Number(venda.total_venda),
    total_comissao: Number(venda.total_comissao),
    total_pago:     Number(venda.total_pago),
    qtd_itens:      Number(venda.qtd_itens),
    credito_gerente_usado: Number(venda.credito_gerente_usado ?? 0),
    aprovacao_credito_tipo: venda.aprovacao_credito_tipo ?? null,
    aprovacao_credito_tarefa_id: venda.aprovacao_credito_tarefa_id ?? null,
    aprovacao_credito_status: venda.aprovacao_credito_status ?? null,
    aprovacao_tarefa_tags: venda.aprovacao_tarefa_tags ?? null,
    aprovacao_credito_responsavel_nome: venda.aprovacao_credito_responsavel_nome ?? null,
    aprovacao_desconto_aprov_id: venda.aprovacao_desconto_aprov_id ?? null,
    desconto_aprovado_por_nome: venda.desconto_aprovado_por_nome ?? null,
    desconto_aprovado_em: venda.desconto_aprovado_em ?? null,
    itens: itens.map((i) => ({
      ...i,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      pct_desconto:   Number(i.pct_desconto),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
      pct_comissao:   Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
    })),
    pagamentos: pagamentos.map((p) => ({
      ...p,
      valor:         Number(p.valor),
      valor_liquido: p.valor_liquido != null ? Number(p.valor_liquido) : null,
      taxas_mp:      p.taxas_mp      != null ? Number(p.taxas_mp)      : null,
    })),
    ordens,
  });
}

// ─── PATCH /api/vendas/[id] ────────────────────────────────────────────────────
// Campos editáveis: situacao, data_entrega, total_frete, forma_envio, forma_frete,
//                   observacoes, observacoes_internas
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "diretor", "gerente_fabrica", "gerente_loja", "consultora"];
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, situacao, bloqueado, aprovacao_credito_tarefa_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.bloqueado) return NextResponse.json({ error: "Venda bloqueada" }, { status: 409 });

  const body = await req.json() as {
    situacao?:             string;
    cliente_id?:           number | null;
    vendedor_id?:          number | null;
    data_venda?:           string;
    data_entrega?:         string | null;
    total_frete?:          number;
    forma_envio?:          string | null;
    forma_frete?:          string | null;
    observacoes?:          string | null;
    observacoes_internas?: string | null;
    video_obs_interna?:    string | null;
    endereco_entrega?:             string | null;
    endereco_entrega_numero?:      string | null;
    endereco_entrega_complemento?: string | null;
    endereco_entrega_bairro?:      string | null;
    endereco_entrega_cidade?:      string | null;
    endereco_entrega_cep?:         string | null;
    endereco_entrega_uf?:          string | null;
    tipo_venda?:           string | null;
    numero_rastreio?:      string | null;
    venda_garantia_id?:    number | null;
    /** Guard de versão — opcional, retrocompatível */
    client_updated_at?:    string;
  };

  const SITUACOES_VALIDAS = ["rascunho", "aprovado", "enviado", "cancelado", "concluido"];
  if (body.situacao && !SITUACOES_VALIDAS.includes(body.situacao)) {
    return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
  }

  // ── Guard de versão (lost-update prevention) ────────────────────────────────
  // Deve rodar ANTES do bloco Tiny, pois o Tiny faz UPDATE em vendas_erp e
  // dispara o trigger de updated_at — causando falso positivo se checado depois.
  if (body.client_updated_at) {
    const [row] = await sql`SELECT updated_at FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
    if (row && new Date(row.updated_at as string).getTime() !== new Date(body.client_updated_at).getTime()) {
      return NextResponse.json(
        { error: "Conflito: registro foi modificado por outro usuário. Recarregue a página." },
        { status: 409 }
      );
    }
  }

  // Campos restritos a rascunho
  if (body.cliente_id !== undefined || body.vendedor_id !== undefined || body.data_venda !== undefined) {
    if (venda.situacao !== "rascunho") {
      return NextResponse.json({ error: "Estes campos só podem ser alterados em rascunho" }, { status: 409 });
    }
  }

  // ── data_entrega obrigatória para aprovar ou confirmar ───────────────────
  if (body.situacao === "aprovado" || body.situacao === "confirmado") {
    const [vendaEntrega] = await sql`
      SELECT data_entrega FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const dataEntregaFinal = body.data_entrega ?? vendaEntrega?.data_entrega;
    if (!dataEntregaFinal) {
      return NextResponse.json(
        { error: "Data de entrega é obrigatória para aprovar a venda." },
        { status: 400 }
      );
    }
  }

  // ── Bloquear aprovação se tem Manual (MP) pendente ───────────────────────
  if (body.situacao === "aprovado") {
    const [mpPendente] = await sql`
      SELECT id FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'Manual (MP)' AND status = 'pendente'
      LIMIT 1
    `;
    if (mpPendente) {
      return NextResponse.json(
        { error: "Confirme o pagamento Manual (MP) antes de aprovar a venda." },
        { status: 409 }
      );
    }
  }

  // ── Bloquear aprovação se lock pendente ──────────────────────────────────
  if (body.situacao === "aprovado" && venda.aprovacao_credito_tarefa_id) {
    return NextResponse.json(
      { error: "Venda aguarda aprovação pendente. Aprove via aba Tarefas antes de prosseguir." },
      { status: 409 }
    );
  }
  // ── Bloquear aprovação se há pagamento A Receber sem aprovação de crédito ──
  if (body.situacao === "aprovado") {
    const [aReceberPend] = await sql`
      SELECT COALESCE(SUM(valor), 0)::numeric AS total
      FROM alissonerp.pagamentos_venda
      WHERE venda_id = ${vendaId} AND forma = 'A Receber' AND status = 'pendente'
    `;
    const [vendaCredTipo] = await sql`
      SELECT aprovacao_credito_tipo FROM alissonerp.vendas_erp WHERE id = ${vendaId}
    `;
    const totalAReceber = Number(aReceberPend?.total ?? 0);
    const aprovacaoTipo = vendaCredTipo?.aprovacao_credito_tipo;
    if (totalAReceber > 0 && (!aprovacaoTipo || aprovacaoTipo === "pendente")) {
      return NextResponse.json(
        { error: "Venda com crédito a receber precisa de aprovação antes de ser aprovada." },
        { status: 400 }
      );
    }
  }
  // ── Bloquear aprovação se desconto >30% sem aprovação (não-admin/dev) ────
  if (body.situacao === "aprovado" && !["desenvolvedor", "admin"].includes(usuario.role)) {
    const [dcCheck] = await sql`
      SELECT
        EXISTS(
          SELECT 1 FROM alissonerp.itens_venda_erp
          WHERE venda_id = ${vendaId} AND pct_desconto > 30
        ) AS tem_desconto_alto,
        desconto_aprovado_por IS NOT NULL AS desconto_ja_aprovado
      FROM alissonerp.vendas_erp
      WHERE id = ${vendaId}
    `;
    if (dcCheck?.tem_desconto_alto && !dcCheck?.desconto_ja_aprovado) {
      return NextResponse.json(
        { error: "Venda tem desconto acima de 30% aguardando aprovação. Solicite aprovação de desconto antes de prosseguir." },
        { status: 409 }
      );
    }
  }

  // ── Guard: transição para 'concluido' exige pagamento real completo ─────────
  // Bloqueia diretamente no PATCH antes do UPDATE para evitar bypass dos guards
  // de concluirVenda. Replica a mesma lógica — data_confirmacao IS NOT NULL
  // exclui preferences fantasma do cálculo.
  if (body.situacao === "concluido") {
    const [pcCheck] = await sql`
      SELECT
        v.total_venda::numeric AS total_venda,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'pendente'), 0)::numeric AS soma_pendentes,
        COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado' AND p.data_confirmacao IS NOT NULL), 0)::numeric AS soma_confirmados
      FROM alissonerp.vendas_erp v
      LEFT JOIN alissonerp.pagamentos_venda p ON p.venda_id = v.id
      WHERE v.id = ${vendaId}
      GROUP BY v.total_venda
    `;
    if (Number(pcCheck?.soma_pendentes ?? 0) > 0) {
      return NextResponse.json(
        { error: "Venda possui pagamentos pendentes. Confirme todos antes de concluir." },
        { status: 409 },
      );
    }
    const somaPaga = Number(pcCheck?.soma_confirmados ?? 0);
    const totalDev = Number(pcCheck?.total_venda ?? 0);
    if (somaPaga < totalDev - 0.01) {
      return NextResponse.json(
        { error: `Pagamento insuficiente: R$${somaPaga.toFixed(2)} confirmados de R$${totalDev.toFixed(2)} devidos.` },
        { status: 409 },
      );
    }
  }

  // ── Envio automático para Tiny ao aprovar ──────────────────────────────────
  let tinyErroWarning: string | null = null;
  if (body.situacao === "aprovado") {
    // Mapa situacao ERP → situacao Tiny v3
    const SITUACAO_TINY: Record<string, number> = {
      rascunho: 0, aberto: 1, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2,
    };

    // Buscar venda completa + cliente
    const [vendaFull] = await sql`
      SELECT v.id, v.numero_venda, v.cliente_id, v.vendedor_id, v.orcamento_id,
        v.data_venda, v.data_entrega, v.total_desconto, v.total_frete,
        v.observacoes, v.observacoes_internas,
        c.nome AS cliente_nome, c.cpf_cnpj AS cliente_cpf_cnpj,
        c.id_api_contato AS cliente_id_tiny,
        vd.id_api_vendedor AS vendedor_id_tiny
      FROM alissonerp.vendas_erp v
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
      WHERE v.id = ${vendaId}
    `;

    // Buscar Bearer token OAuth2 do Tiny
    const [tokenRow] = await sql`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
    `;
    const [tokenRowLegacy] = !tokenRow ? await sql`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_api_token'
    ` : [tokenRow];
    const rawToken = tokenRowLegacy?.valor_encrypted ?? tokenRow?.valor_encrypted;
    if (!rawToken) {
      return NextResponse.json({ error: "Token do Tiny não configurado. Vá em Configurações > Integrações." }, { status: 400 });
    }
    let tinyToken: string;
    try { tinyToken = JSON.parse(rawToken); } catch { tinyToken = String(rawToken); }
    tinyToken = tinyToken.replace(/"/g, "").trim();
    if (!tinyToken) return NextResponse.json({ error: "Token do Tiny inválido" }, { status: 400 });

    // Buscar itens + pagamentos
    const itens = await sql`
      SELECT produto_id, nome_produto, sku, quantidade, preco_unitario, observacao
      FROM alissonerp.itens_venda_erp WHERE venda_id = ${vendaId} ORDER BY id
    `;
    const pagamentos = await sql`
      SELECT forma, valor, parcelas, gateway FROM alissonerp.pagamentos_venda WHERE venda_id = ${vendaId} ORDER BY id
    `;

    // Montar objeto pagamento para o Tiny usando IDs de public.forma_pagamento e public.meio_pagamento
    let tinyPagamento: Record<string, unknown> | null = null;
    if (pagamentos.length > 0) {
      const formaPag = pagamentos[0].forma;
      const [fpRow] = await sql`
        SELECT id_api_tiny FROM public.forma_pagamento WHERE descricao = ${formaPag} AND status = true LIMIT 1
      `;
      if (fpRow?.id_api_tiny) {
        tinyPagamento = { formaRecebimento: { id: Number(fpRow.id_api_tiny) } };
        // Buscar meio de pagamento (gateway) se aplicável
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

    // Montar payload API v3
    const dataVenda = vendaFull.data_venda
      ? new Date(vendaFull.data_venda).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    // Verificar se venda veio de orçamento
    const isOrcamento = !!vendaFull.orcamento_id;
    const TINY_PRODUTO_GENERICO = 746056974; // Aliança Personalizada

    // Se NÃO é orçamento, todos os itens DEVEM ter produto no Tiny — retornar 400 antes de montar payload
    if (!isOrcamento) {
      const semProduto = itens.filter(i => !i.produto_id || !tinyIdMap.has(Number(i.produto_id)));
      if (semProduto.length > 0) {
        return NextResponse.json(
          { error: `Produto "${semProduto[0].nome_produto}" não está cadastrado no Tiny. Vincule o produto antes de aprovar.` },
          { status: 400 }
        );
      }
    }

    const pedidoV3: Record<string, unknown> = {
      numeroPedido: vendaFull.numero_venda,
      idContato: Number(vendaFull.cliente_id_tiny) || undefined,
      situacao: SITUACAO_TINY["aberto"],
      data: dataVenda,
      // NÃO enviar valorDesconto — o desconto já está aplicado no valorUnitario de cada item
      ...(Number(vendaFull.total_frete) > 0 ? { valorFrete: Number(vendaFull.total_frete) } : {}),
      ...(vendaFull.observacoes ? { observacoes: vendaFull.observacoes } : {}),
      ...(vendaFull.observacoes_internas ? { observacoesInternas: vendaFull.observacoes_internas } : {}),
      ...(vendaFull.vendedor_id_tiny ? { vendedor: { id: Number(vendaFull.vendedor_id_tiny) } } : {}),
      // Pagamento — buscar IDs reais de public.forma_pagamento e public.meio_pagamento
      ...(tinyPagamento ? { pagamento: tinyPagamento } : {}),
      itens: itens.map((item) => {
        const tinyProdId = tinyIdMap.get(Number(item.produto_id));
        // Orçamento sem produto: usa produto genérico. Venda normal: obrigatório ter ID.
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
      }),
    };

    // Função para renovar token OAuth2 (refresh_token ou re-auth com client_credentials)
    async function refreshTinyToken(): Promise<string | null> {
      const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
      const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
      if (!ciRow?.valor_encrypted || !csRow?.valor_encrypted) return null;
      let clientId: string, clientSecret: string;
      try { clientId = JSON.parse(ciRow.valor_encrypted); } catch { clientId = String(ciRow.valor_encrypted); }
      try { clientSecret = JSON.parse(csRow.valor_encrypted); } catch { clientSecret = String(csRow.valor_encrypted); }
      clientId = clientId.replace(/"/g, "").trim();
      clientSecret = clientSecret.replace(/"/g, "").trim();

      // Tentar refresh_token primeiro
      const [rtRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_refresh_token'`;
      const attempts: URLSearchParams[] = [];
      if (rtRow?.valor_encrypted) {
        let rt: string;
        try { rt = JSON.parse(rtRow.valor_encrypted); } catch { rt = String(rtRow.valor_encrypted); }
        rt = rt.replace(/"/g, "").trim();
        if (rt) attempts.push(new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: clientId, client_secret: clientSecret }));
      }
      // Fallback: client_credentials
      attempts.push(new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }));

      for (const body of attempts) {
        try {
          const res = await fetch("https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body, signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            console.error(`[Tiny refresh] ${body.get("grant_type")} falhou: ${res.status} ${errText.slice(0, 200)}`);
            continue;
          }
          const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
          await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
          if (tokens.refresh_token) {
            await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}`;
          }
          // Persiste expires_at pra validacao proativa futura
          if (tokens.expires_in) {
            const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
            await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_token_expires_at', ${JSON.stringify(expiresAt)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(expiresAt)}`;
          }
          console.log(`[Tiny refresh] sucesso via ${body.get("grant_type")}`);
          return tokens.access_token;
        } catch (e) {
          console.error(`[Tiny refresh] erro de rede: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
      }
      return null;
    }

    // Verificacao proativa: se o token ja expirou (ou expira em < 2 minutos),
    // renova ANTES de enviar, evitando o 401 reativo.
    const [expiresRow] = await sql`
      SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_token_expires_at'
    `;
    if (expiresRow?.valor_encrypted) {
      let expiresAtIso: string;
      try { expiresAtIso = JSON.parse(expiresRow.valor_encrypted); } catch { expiresAtIso = String(expiresRow.valor_encrypted); }
      expiresAtIso = expiresAtIso.replace(/"/g, "").trim();
      const expiresAt = new Date(expiresAtIso);
      const bufferMs = 2 * 60 * 1000; // 2 minutos de folga
      if (!isNaN(expiresAt.getTime()) && expiresAt.getTime() - Date.now() < bufferMs) {
        console.log(`[Tiny] Token expira em ${Math.round((expiresAt.getTime() - Date.now()) / 1000)}s — renovando proativamente`);
        const newToken = await refreshTinyToken();
        if (newToken) tinyToken = newToken;
      }
    }

    // Enviar para Tiny (com retry após refresh se 401)
    async function enviarParaTiny(token: string): Promise<Response> {
      return fetch("https://api.tiny.com.br/public-api/v3/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(pedidoV3),
        signal: AbortSignal.timeout(15000),
      });
    }

    try {
      let tinyRes = await enviarParaTiny(tinyToken);

      // Se 401 (token expirado), tentar refresh e reenviar
      if (tinyRes.status === 401) {
        const newToken = await refreshTinyToken();
        if (newToken) {
          tinyToken = newToken;
          tinyRes = await enviarParaTiny(tinyToken);
        }
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
          }
          catch { erroMsg += errBody ? `: ${errBody.slice(0, 300)}` : ""; }
        }

        // Se o Tiny diz "já existe" e já temos tiny_pedido_id, o pedido foi criado em execução anterior — tratar como sucesso
        const jaExiste = erroMsg.toLowerCase().includes("já existe") || erroMsg.toLowerCase().includes("ja existe");
        const [vendaAtual] = await sql`SELECT tiny_pedido_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
        if (jaExiste && vendaAtual?.tiny_pedido_id) {
          console.log("[Tiny] Pedido já existe no Tiny — tratando como sucesso, tiny_pedido_id:", vendaAtual.tiny_pedido_id);
          await sql`
            UPDATE alissonerp.vendas_erp SET
              situacao = 'aprovado',
              tiny_sync_status = 'sincronizado',
              tiny_sync_at = NOW(),
              tiny_sync_erro = NULL
            WHERE id = ${vendaId}
          `;
          // não seta tinyErroWarning — continua fluxo normalmente
        } else {
          console.error("[Tiny] Erro ao enviar pedido:", erroMsg, "| Body enviado:", JSON.stringify(pedidoV3).slice(0, 500));
          await sql`
            UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
            WHERE id = ${vendaId}
          `;
          tinyErroWarning = erroMsg;
        }
      } else {
        const tinyData = await tinyRes.json() as { id?: number; numeroPedido?: string };
        // Sucesso: atualizar situação + dados Tiny numa única query
        await sql`
          UPDATE alissonerp.vendas_erp SET
            situacao = 'aprovado',
            tiny_pedido_id = ${String(tinyData.id ?? "")},
            tiny_sync_status = 'sincronizado',
            tiny_sync_at = NOW(),
            tiny_sync_erro = NULL
          WHERE id = ${vendaId}
        `;

        // Recalcular total se frete mudou
        if (body.total_frete !== undefined) {
          await sql`UPDATE alissonerp.vendas_erp SET total_venda = total_produtos + ${body.total_frete} WHERE id = ${vendaId}`;
        }
      }

      // NÃO retornar aqui — continuar para criação de ordem se for orçamento

    } catch (e) {
      const erroMsg = e instanceof Error ? e.message : "Falha na comunicação com o Tiny";
      await sql`
        UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
        WHERE id = ${vendaId}
      `;
      tinyErroWarning = erroMsg;
    }
  }

  await sql`
    UPDATE alissonerp.vendas_erp SET
      situacao             = COALESCE(${body.situacao ?? null},             situacao),
      cliente_id           = COALESCE(${body.cliente_id ?? null},           cliente_id),
      vendedor_id          = COALESCE(${body.vendedor_id ?? null},          vendedor_id),
      data_venda           = COALESCE(${body.data_venda ?? null},           data_venda),
      data_entrega         = COALESCE(${body.data_entrega ?? null},         data_entrega),
      total_frete          = COALESCE(${body.total_frete ?? null},          total_frete),
      forma_envio          = COALESCE(${body.forma_envio ?? null},          forma_envio),
      forma_frete          = COALESCE(${body.forma_frete ?? null},          forma_frete),
      observacoes          = COALESCE(${body.observacoes ?? null},          observacoes),
      observacoes_internas = COALESCE(${body.observacoes_internas ?? null}, observacoes_internas),
      video_obs_interna    = COALESCE(${body.video_obs_interna ?? null},    video_obs_interna),
      endereco_entrega             = COALESCE(${body.endereco_entrega ?? null},             endereco_entrega),
      endereco_entrega_numero      = COALESCE(${body.endereco_entrega_numero ?? null},      endereco_entrega_numero),
      endereco_entrega_complemento = COALESCE(${body.endereco_entrega_complemento ?? null}, endereco_entrega_complemento),
      endereco_entrega_bairro      = COALESCE(${body.endereco_entrega_bairro ?? null},      endereco_entrega_bairro),
      endereco_entrega_cidade      = COALESCE(${body.endereco_entrega_cidade ?? null},      endereco_entrega_cidade),
      endereco_entrega_cep         = COALESCE(${body.endereco_entrega_cep ?? null},         endereco_entrega_cep),
      endereco_entrega_uf          = COALESCE(${body.endereco_entrega_uf ?? null},          endereco_entrega_uf),
      tipo_venda           = COALESCE(${body.tipo_venda ?? null},           tipo_venda),
      numero_rastreio      = COALESCE(${body.numero_rastreio ?? null},      numero_rastreio),
      venda_garantia_id    = COALESCE(${body.venda_garantia_id ?? null},    venda_garantia_id)
    WHERE id = ${vendaId}
  `;

  // Recalcular total_venda se frete mudou
  if (body.total_frete !== undefined) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET total_venda = total_produtos + ${body.total_frete}
      WHERE id = ${vendaId}
    `;
  }

  // ── Sync alterações com Tiny se venda já aprovada e tem pedido Tiny ─────────
  if (!body.situacao && venda.situacao === "aprovado") {
    const [vendaSync] = await sql`
      SELECT v.tiny_pedido_id, v.numero_venda, v.total_desconto, v.total_frete,
        v.observacoes, v.observacoes_internas,
        c.id_api_contato AS cliente_id_tiny,
        vd.id_api_vendedor AS vendedor_id_tiny
      FROM alissonerp.vendas_erp v
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
      WHERE v.id = ${vendaId}
    `;
    if (vendaSync?.tiny_pedido_id) {
      try {
        const [tokenRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
        const rawToken = tokenRow?.valor_encrypted;
        if (rawToken) {
          let tinyToken: string;
          try { tinyToken = JSON.parse(rawToken); } catch { tinyToken = String(rawToken); }
          tinyToken = tinyToken.replace(/"/g, "").trim();
          const updatePayload: Record<string, unknown> = {};
          if (body.total_frete !== undefined) updatePayload.valorFrete = Number(body.total_frete);
          if (body.observacoes !== undefined) updatePayload.observacoes = body.observacoes ?? "";
          if (body.observacoes_internas !== undefined) updatePayload.observacoesInternas = body.observacoes_internas ?? "";
          if (Object.keys(updatePayload).length > 0) {
            await fetch(`https://api.tiny.com.br/public-api/v3/pedidos/${vendaSync.tiny_pedido_id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tinyToken}` },
              body: JSON.stringify(updatePayload),
              signal: AbortSignal.timeout(15000),
            });
          }
        }
      } catch { /* sync Tiny não bloqueia edição local */ }
    }
  }

  // Auto-baixa estoque comercial removida — trigger 111 (trg_estoque_comercial_baixa_venda) já cuida disso.

  // ── Auto-criar ordem de fabricação se venda veio de orçamento (ao aprovar ou concluir) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ordemCriada: any = null;
  if (body.situacao === "aprovado" || body.situacao === "concluido") {
    const [vendaOrc] = await sql`
      SELECT v.orcamento_id, v.cliente_id, v.vendedor_id, v.data_entrega,
             v.numero_venda,
             o.id AS orc_id, o.tipo, o.peso, o.numero_orcamento, o.nome_modelo,
             o.foto_3d, o.ficha_tecnica_id, o.ficha_tecnica_2_id, o.quantidade,
             ft.perfil, ft.modelo, ft.aro_numeracao, ft.largura, ft.espessura,
             ft.peso_estimado, ft.densidade_ouro, ft.cor_metal,
             ft.tipo_fonte, ft.texto, ft.qtd_pedras, ft.tamanho_pedra,
             ft.tipo_aplicacao_pedra, ft.pedras_detalhadas
      FROM alissonerp.vendas_erp v
      LEFT JOIN alissonerp.orcamentos o ON o.id = v.orcamento_id
      LEFT JOIN alissonerp.orcamento_fichas_tecnicas ft ON ft.id = o.ficha_tecnica_id
      WHERE v.id = ${vendaId} AND v.orcamento_id IS NOT NULL
    `;

    if (vendaOrc?.orc_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sql as any).begin(async (tx: typeof sql) => {
        // C3: Lock no orçamento para evitar criação de ordens duplicadas em requests simultâneos
        const [orcLockPatch] = await tx`SELECT id, ordem_gerada_id FROM alissonerp.orcamentos WHERE id = ${vendaOrc.orc_id} FOR UPDATE`;
        if (orcLockPatch?.ordem_gerada_id) {
          const [existenteTxPatch] = await tx`SELECT id, numero_ordem FROM alissonerp.ordens WHERE id = ${orcLockPatch.ordem_gerada_id}`;
          if (existenteTxPatch) { ordemCriada = { id: existenteTxPatch.id, numero_ordem: existenteTxPatch.numero_ordem }; return; }
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

        // Criar ordem — inclui numero_pedido pra aparecer na coluna "PEDIDO PDV"
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
        ordemCriada = { id: ordem.id, numero_ordem: ordem.numero_ordem };

        // Item 1 da ordem
        const nomeItem = vendaOrc.tipo === "alianca"
          ? `${isPar ? "Aliança 1 - " : "Aliança "}${perfilNomes[vendaOrc.perfil as string] ?? vendaOrc.modelo ?? "Personalizada"}`
          : `Peça Personalizada`;
        await tx`
          INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
          VALUES (${ordem.id}, ${nomeItem}, 1, ${pesoItem1})
        `;

        // Ficha técnica
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
          if (Array.isArray(vendaOrc.pedras_detalhadas) && vendaOrc.pedras_detalhadas.length > 0) {
            dadosFicha.pedras_detalhadas = vendaOrc.pedras_detalhadas;
          }
        } else {
          if (vendaOrc.peso_estimado) dadosFicha.peso_estimado = vendaOrc.peso_estimado;
          if (vendaOrc.cor_metal) dadosFicha.cor_metal = vendaOrc.cor_metal;
          if (vendaOrc.pedras_detalhadas) dadosFicha.pedras_detalhadas = vendaOrc.pedras_detalhadas;
        }
        await tx`
          INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
          VALUES (${ordem.id}, ${tipoItem}, ${JSON.stringify(dadosFicha)}::jsonb, ${user.id}::uuid)
        `;

        // Aliança 2 (se par)
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
            if (Array.isArray(ft2.pedras_detalhadas) && ft2.pedras_detalhadas.length > 0) {
              dadosFicha2.pedras_detalhadas = ft2.pedras_detalhadas;
            }
            await tx`
              INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
              VALUES (${ordem.id}, 'alianca', ${JSON.stringify(dadosFicha2)}::jsonb, ${user.id}::uuid)
            `;
          }
        }

        // Auditoria criada e aprovada automaticamente pelo trigger trg_auto_auditoria_loja

        // Atualizar orçamento com ordem gerada
        await tx`
          UPDATE alissonerp.orcamentos
          SET ordem_gerada_id = ${ordem.id}, updated_at = NOW()
          WHERE id = ${vendaOrc.orc_id}
        `;
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ...(ordemCriada ? { ordem_criada: ordemCriada.numero_ordem } : {}),
    ...(tinyErroWarning ? { tiny_warning: tinyErroWarning } : {}),
  });
}
