/**
 * GET /api/public/produtos
 * API pública — sem autenticação — para uso no site externo.
 *
 * Params:
 *   ?busca=texto          — filtra nome ou SKU (mín. 2 chars)
 *   ?categoria=Anel       — filtra por categoria (ex: "Anel", "Pulseira")
 *   ?tipo_metal=Ouro+18k  — filtra por metal
 *   ?com_estoque=true     — só produtos com saldo >= 1
 *   ?page=1&limit=50      — paginação (max 100)
 *   ?order=nome|preco     — ordenação
 *   ?sku=AN001            — produto específico por SKU
 *
 * Resposta: { produtos: [...], total, page, totalPages }
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const busca      = sp.get("busca")?.trim() ?? "";
  const categoria  = sp.get("categoria")?.trim() ?? "";
  const tipo_metal = sp.get("tipo_metal")?.trim() ?? "";
  const com_estoque = sp.get("com_estoque") === "true";
  const sku        = sp.get("sku")?.trim() ?? "";
  const order      = sp.get("order") === "preco" ? "preco" : "nome";

  const page  = Math.max(1, Number(sp.get("page")  ?? 1));
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const wBusca = busca.length >= 2
    ? sql`AND (p.nome ILIKE ${"%" + busca + "%"} OR p.sku ILIKE ${"%" + busca + "%"})`
    : sql``;

  const wCategoria = categoria
    ? sql`AND (TRIM(p.categoria) = ${categoria} OR TRIM(p.categoria) ILIKE ${categoria + " -> %"})`
    : sql``;

  const wMetal = tipo_metal
    ? sql`AND p.tipo_metal = ${tipo_metal}`
    : sql``;

  const wSku = sku
    ? sql`AND p.sku = ${sku}`
    : sql``;

  const wEstoque = com_estoque
    ? sql`AND (
        EXISTS (SELECT 1 FROM public.estoque e WHERE e.sku = p.sku AND e.saldo >= 1)
        OR EXISTS (SELECT 1 FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku AND v.saldo >= 1)
      )`
    : sql``;

  const orderExpr = order === "preco"
    ? sql`COALESCE(p.preco_tiny::numeric, 0) ASC NULLS LAST`
    : sql`p.nome ASC`;

  try {
    const [countRow] = await sql<{ total: string }[]>`
      SELECT COUNT(*) AS total
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.situacao = 'A'
        AND (ep.eh_variacao IS NULL OR ep.eh_variacao = false)
        ${wBusca} ${wCategoria} ${wMetal} ${wSku} ${wEstoque}
    `;

    const total      = Number(countRow?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    const produtos = await sql`
      SELECT
        p.id_produto,
        p.nome,
        p.sku,
        p.tipo_metal,
        p.categoria,
        p.tem_pedra_preciosa,
        vc.url_capa                     AS foto,
        COALESCE(vi.imagens, '[]'::jsonb) AS imagens,
        COALESCE(p.preco_tiny::numeric, p.preco_sync::numeric, 0)  AS preco,
        -- Preço mínimo entre variações filhas (se produto pai)
        (
          SELECT MIN(pf.preco_tiny::numeric)
          FROM alissonerp.erp_produtos pai_e
          JOIN alissonerp.erp_produtos filho_e ON filho_e.parent_id = pai_e.id
          JOIN public.produtos pf ON pf.id_produto = filho_e.produto_id
          WHERE pai_e.produto_id = p.id_produto
            AND pf.preco_tiny IS NOT NULL AND pf.preco_tiny::numeric > 0
        )                               AS preco_variacao_min,
        ep.eh_pai,
        ep.parent_sku,
        ep.sufixo_variacao,
        -- Saldo consolidado
        GREATEST(
          COALESCE((SELECT e.saldo FROM public.estoque e WHERE e.sku = p.sku LIMIT 1), 0)::int,
          COALESCE((SELECT SUM(v.saldo) FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku), 0)::int
        )                               AS estoque
      FROM public.produtos p
      LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.situacao = 'A'
        AND (ep.eh_variacao IS NULL OR ep.eh_variacao = false)
        ${wBusca} ${wCategoria} ${wMetal} ${wSku} ${wEstoque}
      ORDER BY ${orderExpr}
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json(
      { produtos, total, page, totalPages },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("[api/public/produtos]", err);
    return NextResponse.json(
      { error: "Erro interno" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
