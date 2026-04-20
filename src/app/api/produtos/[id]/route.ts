/**
 * GET  /api/produtos/[id]  — detalhe com composição + erp_produtos (medidas, pai/var)
 * PATCH /api/produtos/[id] — campos editáveis: tem_pedra_preciosa (public.produtos)
 *                            + observacao_erp, medidas (erp_produtos upsert)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    // ── Verificar se migration 063 está aplicada ─────────────────────────────
    const [tableRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
      ) AS exists
    `;
    const erpDisponivel = tableRow?.exists === true;

    // ── SELECT produto ────────────────────────────────────────────────────────
    const [produto] = erpDisponivel
      ? await sql`
          SELECT
            p.id_produto,
            p.nome,
            p.sku,
            p.tipo_metal,
            p.peso_precificado,
            p.preco_tiny,
            p.preco_sync,
            p.preco_pedras,
            p.preco_total_sync,
            p.diferenca_percentual,
            p.tem_pedra_preciosa,
            p.situacao,
            NULL::text   AS foto_produto,
            NULL::text   AS descricao,
            NULL::text   AS referencia,
            p.categoria_precificacao AS categoria,
            p.categoria              AS categoria_geral,
            p.markup,
            p.fator,
            -- Preço calculado pela curva (peso × ouro × markup_aplicado × fator).
            -- Usa markup da curva se aplicada, senão markup do produto. Fator default 1.
            -- EXCEÇÃO: pedras não seguem a curva (preço vem direto de preco_tiny).
            CASE
              WHEN p.categoria ILIKE 'Pedras%' THEN NULL
              WHEN p.peso_precificado > 0
               AND ((SELECT markup_aplicado FROM alissonerp.produto_curva_aplicada WHERE produto_id = p.id_produto) > 0 OR p.markup > 0)
               AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
              THEN ROUND(
                p.peso_precificado::numeric
                * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                * COALESCE(
                    (SELECT markup_aplicado::numeric FROM alissonerp.produto_curva_aplicada WHERE produto_id = p.id_produto),
                    p.markup::numeric
                  )
                * COALESCE(p.fator::numeric, 1)
                / 10
              )::int * 10
              ELSE NULL
            END AS preco_curva,
            (SELECT tipo_item FROM alissonerp.produto_tipo_item WHERE produto_id = p.id_produto) AS tipo_item,
            NULL::text   AS sub_categoria,
            ep.id        AS erp_id,
            ep.eh_pai,
            ep.eh_variacao,
            ep.parent_sku,
            ep.numeracao,
            ep.cor_metal,
            ep.comprimento,
            ep.largura_aro,
            ep.altura_aro,
            ep.base,
            ep.observacao_erp,
            CASE WHEN ep.eh_pai = true THEN (
              SELECT count(*)::integer
              FROM alissonerp.erp_produtos filhos
              WHERE filhos.parent_id = ep.id
            ) ELSE 0 END AS qtd_variacoes
          FROM public.produtos p
          LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
          WHERE p.id_produto = ${produtoId}
        `
      : await sql`
          SELECT
            p.id_produto,
            p.nome,
            p.sku,
            p.tipo_metal,
            p.peso_precificado,
            p.preco_tiny,
            p.preco_sync,
            p.preco_pedras,
            p.preco_total_sync,
            p.diferenca_percentual,
            p.tem_pedra_preciosa,
            p.situacao,
            NULL::text    AS foto_produto,
            NULL::text    AS descricao,
            NULL::text    AS referencia,
            p.categoria_precificacao AS categoria,
            p.categoria              AS categoria_geral,
            p.markup,
            p.fator,
            -- Preço calculado pela curva (peso × ouro × markup_aplicado × fator).
            -- Usa markup da curva se aplicada, senão markup do produto. Fator default 1.
            -- EXCEÇÃO: pedras não seguem a curva (preço vem direto de preco_tiny).
            CASE
              WHEN p.categoria ILIKE 'Pedras%' THEN NULL
              WHEN p.peso_precificado > 0
               AND ((SELECT markup_aplicado FROM alissonerp.produto_curva_aplicada WHERE produto_id = p.id_produto) > 0 OR p.markup > 0)
               AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
              THEN ROUND(
                p.peso_precificado::numeric
                * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                * COALESCE(
                    (SELECT markup_aplicado::numeric FROM alissonerp.produto_curva_aplicada WHERE produto_id = p.id_produto),
                    p.markup::numeric
                  )
                * COALESCE(p.fator::numeric, 1)
                / 10
              )::int * 10
              ELSE NULL
            END AS preco_curva,
            (SELECT tipo_item FROM alissonerp.produto_tipo_item WHERE produto_id = p.id_produto) AS tipo_item,
            NULL::text    AS sub_categoria,
            NULL::integer AS erp_id,
            NULL::boolean AS eh_pai,
            NULL::boolean AS eh_variacao,
            NULL::text    AS parent_sku,
            NULL::text    AS numeracao,
            NULL::text    AS cor_metal,
            NULL::numeric AS comprimento,
            NULL::numeric AS largura_aro,
            NULL::numeric AS altura_aro,
            NULL::numeric AS base,
            NULL::text    AS observacao_erp,
            0::integer    AS qtd_variacoes
          FROM public.produtos p
          WHERE p.id_produto = ${produtoId}
        `;

    if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const composicao = await sql`
      SELECT
        pc.id,
        pc.insumo_id,
        i.nome      AS insumo_nome,
        i.unidade   AS insumo_unidade,
        pc.tipo,
        pc.quantidade,
        pc.tamanho,
        pc.unidade_tamanho,
        pc.preco_compra_usd,
        pc.obrigatorio,
        pc.observacao
      FROM alissonerp.produto_composicao pc
      LEFT JOIN alissonerp.insumos i ON i.id = pc.insumo_id
      WHERE pc.produto_id = ${produtoId}
      ORDER BY pc.tipo, pc.id
    `;

    // Variações: só se for pai e erp disponível
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let variacoes: any[] = [];
    if (erpDisponivel && produto.eh_pai && produto.erp_id) {
      variacoes = await sql`
        SELECT
          ep.id        AS erp_id,
          ep.produto_id,
          ep.sku,
          ep.nome,
          ep.sufixo_variacao,
          ep.numeracao,
          ep.cor_metal,
          ep.largura_aro,
          ep.altura_aro,
          ep.base,
          p.peso_precificado,
          p.preco_sync,
          p.preco_tiny,
          p.situacao
        FROM alissonerp.erp_produtos ep
        JOIN public.produtos p ON p.id_produto = ep.produto_id
        WHERE ep.parent_id = ${produto.erp_id as number}
        ORDER BY
          NULLIF(regexp_replace(ep.sufixo_variacao, '[^0-9]', '', 'g'), '')::integer NULLS LAST,
          ep.sufixo_variacao ASC NULLS LAST
      `;
    }

    // Cotação atual do ouro (para cálculo em runtime no drawer)
    const [cot] = await sql<{ ouro: string | null }[]>`SELECT ouro FROM public.parametros LIMIT 1`;
    const cotacao_ouro = Number(cot?.ouro ?? 0);

    return NextResponse.json({ produto, composicao, variacoes, cotacao_ouro });
  } catch (err) {
    console.error("[GET /api/produtos/[id]]", err);
    return NextResponse.json({ error: "Erro ao buscar produto" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();

  // Campos que vão para public.produtos
  const pubUpdate: Record<string, unknown> = {};
  if (typeof body.tem_pedra_preciosa === "boolean") {
    pubUpdate.tem_pedra_preciosa = body.tem_pedra_preciosa;
  }
  if (typeof body.nome === "string") {
    const n = body.nome.trim();
    if (n) pubUpdate.nome = n;
  }
  if (body.tipo_metal !== undefined) {
    const t = typeof body.tipo_metal === "string" ? body.tipo_metal.trim() : null;
    pubUpdate.tipo_metal = t ? t : null;
  }
  if (body.categoria_geral !== undefined) {
    const c = typeof body.categoria_geral === "string" ? body.categoria_geral.trim() : null;
    pubUpdate.categoria = c ? c : null;
  }
  if (typeof body.situacao === "string" && (body.situacao === "A" || body.situacao === "I")) {
    pubUpdate.situacao = body.situacao;
  }
  if (body.peso_precificado !== undefined) {
    const n = body.peso_precificado == null ? null : Number(body.peso_precificado);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "peso_precificado inválido" }, { status: 400 });
    pubUpdate.peso_precificado = n;
  }
  if (body.markup !== undefined) {
    const n = body.markup == null ? null : Number(body.markup);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "markup inválido" }, { status: 400 });
    pubUpdate.markup = n;
  }
  if (body.fator !== undefined) {
    const n = body.fator == null ? null : Number(body.fator);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "fator inválido" }, { status: 400 });
    pubUpdate.fator = n;
  }
  if (body.categoria_precificacao !== undefined) {
    const c = typeof body.categoria_precificacao === "string" ? body.categoria_precificacao.trim() : null;
    pubUpdate.categoria_precificacao = c ? c : null;
  }
  if (body.preco_tiny !== undefined) {
    const n = body.preco_tiny == null ? null : Number(body.preco_tiny);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "preco_tiny inválido" }, { status: 400 });
    pubUpdate.preco_tiny = n;
  }

  // tipo_item vai para tabela auxiliar
  let tipoItem: "joia" | "insumo" | null | undefined = undefined;
  if (body.tipo_item !== undefined) {
    if (body.tipo_item === null || body.tipo_item === "") tipoItem = null;
    else if (body.tipo_item === "joia" || body.tipo_item === "insumo") tipoItem = body.tipo_item;
    else return NextResponse.json({ error: "tipo_item inválido" }, { status: 400 });
  }

  // Campos que vão para erp_produtos (upsert)
  const erpUpdate: Record<string, unknown> = {};
  if (typeof body.observacao_erp === "string") {
    erpUpdate.observacao_erp = body.observacao_erp.trim() || null;
  }
  if (body.largura_aro !== undefined) {
    erpUpdate.largura_aro = body.largura_aro != null ? Number(body.largura_aro) : null;
  }
  if (body.altura_aro !== undefined) {
    erpUpdate.altura_aro = body.altura_aro != null ? Number(body.altura_aro) : null;
  }
  if (body.base !== undefined) {
    erpUpdate.base = body.base != null ? Number(body.base) : null;
  }

  if (Object.keys(pubUpdate).length === 0 && Object.keys(erpUpdate).length === 0 && tipoItem === undefined) {
    return NextResponse.json({ error: "Nenhum campo editável informado" }, { status: 400 });
  }

  try {
    // ── public.produtos ────────────────────────────────────────────────────
    if (pubUpdate.tem_pedra_preciosa !== undefined) {
      await sql`
        UPDATE public.produtos
        SET tem_pedra_preciosa = ${pubUpdate.tem_pedra_preciosa as boolean}
        WHERE id_produto = ${produtoId}
      `;
      await recalcularPrecoPedras(produtoId);
    }
    if (pubUpdate.nome !== undefined) {
      await sql`UPDATE public.produtos SET nome = ${pubUpdate.nome as string} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.tipo_metal !== undefined) {
      await sql`UPDATE public.produtos SET tipo_metal = ${pubUpdate.tipo_metal as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.categoria !== undefined) {
      await sql`UPDATE public.produtos SET categoria = ${pubUpdate.categoria as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.situacao !== undefined) {
      await sql`UPDATE public.produtos SET situacao = ${pubUpdate.situacao as string} WHERE id_produto = ${produtoId}`;
    }
    // Precificação — campos de entrada. Trigger em public.produtos recalcula preco_sync.
    if (pubUpdate.peso_precificado !== undefined) {
      await sql`UPDATE public.produtos SET peso_precificado = ${pubUpdate.peso_precificado as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.markup !== undefined) {
      await sql`UPDATE public.produtos SET markup = ${pubUpdate.markup as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.fator !== undefined) {
      await sql`UPDATE public.produtos SET fator = ${pubUpdate.fator as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.categoria_precificacao !== undefined) {
      await sql`UPDATE public.produtos SET categoria_precificacao = ${pubUpdate.categoria_precificacao as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.preco_tiny !== undefined) {
      await sql`UPDATE public.produtos SET preco_tiny = ${pubUpdate.preco_tiny as number | null} WHERE id_produto = ${produtoId}`;
    }
    // tipo_item: upsert ou delete em alissonerp.produto_tipo_item
    if (tipoItem !== undefined) {
      if (tipoItem === null) {
        await sql`DELETE FROM alissonerp.produto_tipo_item WHERE produto_id = ${produtoId}`;
      } else {
        await sql`
          INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
          VALUES (${produtoId}, ${tipoItem})
          ON CONFLICT (produto_id) DO UPDATE SET tipo_item = EXCLUDED.tipo_item, updated_at = now()
        `;
      }
    }

    // ── erp_produtos — upsert com campos ERP ──────────────────────────────
    // Silencioso se tabela não existe (migration 063 pendente).
    if (Object.keys(erpUpdate).length > 0) {
      const [tbl] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
        ) AS exists
      `;
      if (!tbl?.exists) {
        console.warn("[PATCH /api/produtos/[id]] erp_produtos não existe — campos ERP ignorados (migration 063 pendente)");
      } else {
      await sql`
        INSERT INTO alissonerp.erp_produtos (produto_id, sku, nome,
          largura_aro, altura_aro, base, observacao_erp)
        SELECT
          id_produto, sku, nome,
          ${erpUpdate.largura_aro    !== undefined ? (erpUpdate.largura_aro    as number | null) : null}::numeric,
          ${erpUpdate.altura_aro     !== undefined ? (erpUpdate.altura_aro     as number | null) : null}::numeric,
          ${erpUpdate.base           !== undefined ? (erpUpdate.base           as number | null) : null}::numeric,
          ${erpUpdate.observacao_erp !== undefined ? (erpUpdate.observacao_erp as string | null) : null}::text
        FROM public.produtos
        WHERE id_produto = ${produtoId}
        ON CONFLICT (produto_id) DO UPDATE SET
          largura_aro    = CASE WHEN ${erpUpdate.largura_aro    !== undefined} THEN EXCLUDED.largura_aro    ELSE erp_produtos.largura_aro    END,
          altura_aro     = CASE WHEN ${erpUpdate.altura_aro     !== undefined} THEN EXCLUDED.altura_aro     ELSE erp_produtos.altura_aro     END,
          base           = CASE WHEN ${erpUpdate.base           !== undefined} THEN EXCLUDED.base           ELSE erp_produtos.base           END,
          observacao_erp = CASE WHEN ${erpUpdate.observacao_erp !== undefined} THEN EXCLUDED.observacao_erp ELSE erp_produtos.observacao_erp END,
          date_updated   = NOW()
      `;
      } // end if tbl?.exists
    }

    // SELECT de retorno — com ou sem erp_produtos
    const [tblCheck] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
      ) AS exists
    `;
    const [produto] = tblCheck?.exists
      ? await sql`
          SELECT
            p.id_produto, p.nome, p.sku,
            p.tem_pedra_preciosa, p.preco_pedras, p.preco_total_sync,
            ep.largura_aro, ep.altura_aro, ep.base, ep.observacao_erp
          FROM public.produtos p
          LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
          WHERE p.id_produto = ${produtoId}
        `
      : await sql`
          SELECT
            id_produto, nome, sku,
            tem_pedra_preciosa, preco_pedras, preco_total_sync,
            NULL::numeric AS largura_aro,
            NULL::numeric AS altura_aro,
            NULL::numeric AS base,
            NULL::text    AS observacao_erp
          FROM public.produtos
          WHERE id_produto = ${produtoId}
        `;
    return NextResponse.json({ produto });
  } catch (err) {
    console.error("[PATCH /api/produtos/[id]]", err);
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 });
  }
}
