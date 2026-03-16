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
            NULL::text   AS tipo_metal,
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
            NULL::text    AS tipo_metal,
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

    return NextResponse.json({ produto, composicao, variacoes });
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

  if (Object.keys(pubUpdate).length === 0 && Object.keys(erpUpdate).length === 0) {
    return NextResponse.json({ error: "Nenhum campo editável informado" }, { status: 400 });
  }

  try {
    // ── public.produtos — só tem_pedra_preciosa ────────────────────────────
    if (pubUpdate.tem_pedra_preciosa !== undefined) {
      await sql`
        UPDATE public.produtos
        SET tem_pedra_preciosa = ${pubUpdate.tem_pedra_preciosa as boolean}
        WHERE id_produto = ${produtoId}
      `;
      await recalcularPrecoPedras(produtoId);
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
