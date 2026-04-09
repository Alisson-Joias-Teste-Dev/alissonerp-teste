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
      c.endereco AS cliente_endereco, c.numero AS cliente_numero, c.complemento AS cliente_complemento,
      c.bairro AS cliente_bairro, c.municipio AS cliente_municipio, c.cep AS cliente_cep, c.uf AS cliente_uf
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
      desconto_autorizado_por, observacao, peso_estimado, created_at
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  const pagamentos = await sql`
    SELECT
      id, forma, gateway, valor, parcelas,
      status, gateway_id, data_confirmacao, created_at
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId}
    ORDER BY id
  `;

  return NextResponse.json({
    ...venda,
    total_produtos: Number(venda.total_produtos),
    total_desconto: Number(venda.total_desconto),
    total_frete:    Number(venda.total_frete),
    total_venda:    Number(venda.total_venda),
    total_comissao: Number(venda.total_comissao),
    total_pago:     Number(venda.total_pago),
    qtd_itens:      Number(venda.qtd_itens),
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
      valor: Number(p.valor),
    })),
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
  const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, situacao, bloqueado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
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
  };

  const SITUACOES_VALIDAS = ["rascunho", "aprovado", "enviado", "cancelado", "concluido"];
  if (body.situacao && !SITUACOES_VALIDAS.includes(body.situacao)) {
    return NextResponse.json({ error: "Situação inválida" }, { status: 400 });
  }

  // Campos restritos a rascunho
  if (body.cliente_id !== undefined || body.vendedor_id !== undefined || body.data_venda !== undefined) {
    if (venda.situacao !== "rascunho") {
      return NextResponse.json({ error: "Estes campos só podem ser alterados em rascunho" }, { status: 409 });
    }
  }

  // ── Envio automático para Tiny ao aprovar ──────────────────────────────────
  if (body.situacao === "aprovado") {
    // Mapa situacao ERP → situacao Tiny v3
    const SITUACAO_TINY: Record<string, number> = {
      rascunho: 0, aprovado: 3, confirmado: 3, concluido: 6, cancelado: 2,
    };

    // Buscar venda completa + cliente
    const [vendaFull] = await sql`
      SELECT v.id, v.numero_venda, v.cliente_id, v.vendedor_id,
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

    // Se algum item não tem id_api_produto (ex: produto de orçamento), aprovar sem enviar ao Tiny
    const todosTemTinyId = itens.length > 0 && tinyIdMap.size > 0 && itens.every(i => i.produto_id && tinyIdMap.has(Number(i.produto_id)));
    if (!todosTemTinyId) {
      await sql`UPDATE alissonerp.vendas_erp SET situacao = 'aprovado' WHERE id = ${vendaId}`;
      if (body.total_frete !== undefined) {
        await sql`UPDATE alissonerp.vendas_erp SET total_venda = total_produtos - total_desconto + ${body.total_frete} WHERE id = ${vendaId}`;
      }
      return NextResponse.json({ ok: true, tiny_skipped: true });
    }

    // Montar payload API v3
    const dataVenda = vendaFull.data_venda
      ? new Date(vendaFull.data_venda).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const pedidoV3: Record<string, unknown> = {
      numeroPedido: vendaFull.numero_venda,
      idContato: Number(vendaFull.cliente_id_tiny) || undefined,
      situacao: SITUACAO_TINY["aprovado"],
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
        return {
          produto: {
            ...(tinyProdId ? { id: tinyProdId } : {}),
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

    // Enviar para Tiny
    try {
      const tinyRes = await fetch("https://api.tiny.com.br/public-api/v3/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tinyToken}` },
        body: JSON.stringify(pedidoV3),
        signal: AbortSignal.timeout(15000),
      });

      if (!tinyRes.ok) {
        const errBody = await tinyRes.text();
        let erroMsg = `Tiny API ${tinyRes.status}`;
        try {
          const errJson = JSON.parse(errBody);
          // Tiny v3 pode retornar: { message, error, descricao, erros: [...] }
          const msg = errJson.message || errJson.error || errJson.descricao || "";
          const erros = Array.isArray(errJson.erros)
            ? errJson.erros.map((e: Record<string, string>) => e.mensagem || e.campo || JSON.stringify(e)).join("; ")
            : "";
          erroMsg = [msg, erros].filter(Boolean).join(" — ") || `${erroMsg}: ${JSON.stringify(errJson).slice(0, 300)}`;
        }
        catch { erroMsg += `: ${errBody.slice(0, 300)}`; }
        console.error("[Tiny] Erro ao enviar pedido:", erroMsg, "| Body enviado:", JSON.stringify(pedidoV3).slice(0, 500));
        await sql`
          UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
          WHERE id = ${vendaId}
        `;
        return NextResponse.json({ error: `Erro Tiny: ${erroMsg}` }, { status: 502 });
      }

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
        await sql`UPDATE alissonerp.vendas_erp SET total_venda = total_produtos - total_desconto + ${body.total_frete} WHERE id = ${vendaId}`;
      }

      return NextResponse.json({ ok: true, tiny_pedido_id: tinyData.id });

    } catch (e) {
      const erroMsg = e instanceof Error ? e.message : "Falha na comunicação com o Tiny";
      await sql`
        UPDATE alissonerp.vendas_erp SET tiny_sync_status = 'erro', tiny_sync_at = NOW(), tiny_sync_erro = ${erroMsg}
        WHERE id = ${vendaId}
      `;
      return NextResponse.json({ error: `Erro Tiny: ${erroMsg}` }, { status: 502 });
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
      endereco_entrega_uf          = COALESCE(${body.endereco_entrega_uf ?? null},          endereco_entrega_uf)
    WHERE id = ${vendaId}
  `;

  // Recalcular total_venda se frete mudou
  if (body.total_frete !== undefined) {
    await sql`
      UPDATE alissonerp.vendas_erp
      SET total_venda = total_produtos - total_desconto + ${body.total_frete}
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

  // ── Auto-criar ordem de fabricação se venda veio de orçamento e foi concluída ──
  if (body.situacao === "concluido") {
    const [vendaOrc] = await sql`
      SELECT v.orcamento_id, v.cliente_id, v.vendedor_id, v.data_entrega,
             o.id AS orc_id, o.tipo, o.peso, o.numero_orcamento, o.nome_modelo,
             o.foto_3d, o.ficha_tecnica_id,
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
        const perfilNomes: Record<string, string> = {
          Anatomica: "Anatômica", Boleada: "Boleada", BoleadaDouble: "Boleada Dupla",
          Chanfrada: "Chanfrada", Concava: "Côncava", FrisoUnico: "Friso Único",
          FrisoLateral: "Friso Lateral", QuadradoCanal: "Quadrado Canal", Simples: "Reta",
        };

        const [{ max_id_ali }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_ali FROM alissonerp.ordens`;
        const [{ max_id_dir }] = await tx`SELECT COALESCE(MAX(id), 0) AS max_id_dir FROM directus.ordens`;
        const nextNum = Math.max(Number(max_id_ali), Number(max_id_dir)) + 1;
        const numeroOrdem = "C-" + String(nextNum).padStart(4, "0");
        const pesoNeg = Number(vendaOrc.peso ?? vendaOrc.peso_estimado ?? 0);

        // Criar ordem
        const [ordem] = await tx`
          INSERT INTO alissonerp.ordens (
            numero_ordem, tipo_ordem, situacao, status, rota,
            cliente_id, vendedor_id, peso_metal_negociado,
            data_entrega, detalhes_ordem, foto_peca_servico, venda_id, created_at
          ) VALUES (
            ${numeroOrdem}, 'fabricacao'::alissonerp.enum_tipo_ordem,
            'criado', 'aguardando', 'pcp',
            ${vendaOrc.cliente_id}, ${vendaOrc.vendedor_id},
            ${pesoNeg}, ${vendaOrc.data_entrega},
            ${'Venda V-' + String(vendaId).padStart(5, '0') + ' / Orçamento ' + vendaOrc.numero_orcamento},
            ${vendaOrc.foto_3d ?? null}, ${vendaId}, NOW()
          ) RETURNING id, numero_ordem
        `;

        // Item da ordem
        const nomeItem = vendaOrc.tipo === "alianca"
          ? `Aliança ${perfilNomes[vendaOrc.perfil as string] ?? vendaOrc.modelo ?? "Personalizada"}`
          : `Peça Personalizada`;
        await tx`
          INSERT INTO alissonerp.itens_ordem (ordem_id, nome_produto, quantidade, peso_estimado)
          VALUES (${ordem.id}, ${nomeItem}, 1, ${pesoNeg})
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
        } else {
          if (vendaOrc.peso_estimado) dadosFicha.peso_estimado = vendaOrc.peso_estimado;
          if (vendaOrc.cor_metal) dadosFicha.cor_metal = vendaOrc.cor_metal;
          if (vendaOrc.pedras_detalhadas) dadosFicha.pedras_detalhadas = vendaOrc.pedras_detalhadas;
        }
        await tx`
          INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
          VALUES (${ordem.id}, ${tipoItem}, ${JSON.stringify(dadosFicha)}::jsonb, ${user.id}::uuid)
        `;

        // Auditoria loja pendente
        await tx`
          INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, peso_negociado, parecer, dados_ordem)
          VALUES ('pendente', 'loja', 'entrada_ordem', ${ordem.id}, ${pesoNeg}, NULL,
            ${JSON.stringify({ numero_ordem: numeroOrdem, tipo_ordem: "fabricacao", rota: "pcp", peso_negociado: pesoNeg, origem: "orcamento_venda", orcamento_id: vendaOrc.orc_id })}::jsonb)
        `;

        // Atualizar orçamento com ordem gerada
        await tx`
          UPDATE alissonerp.orcamentos
          SET ordem_gerada_id = ${ordem.id}, updated_at = NOW()
          WHERE id = ${vendaOrc.orc_id}
        `;
      });
    }
  }

  return NextResponse.json({ ok: true });
}
