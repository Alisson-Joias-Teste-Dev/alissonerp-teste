/**
 * GET /api/v1/produtos
 *
 * API pública de produtos — requer X-API-Key header.
 *
 * Query params:
 *   page          número da página (default: 1)
 *   per_page      itens por página, máx 100 (default: 20)
 *   situacao      "ativo" | "inativo" | "todos" (default: "ativo")
 *   categoria     filtra por categoria_geral (ex: "Anéis")
 *   q             busca por nome ou SKU
 *   updated_after ISO 8601 — retorna apenas produtos atualizados após essa data
 *                 Útil para sincronização incremental (ex: last_sync timestamp)
 */

import { NextRequest } from "next/server";
import sql from "@/lib/db";
import { autenticarApiKey, apiListResponse } from "@/lib/api-publica";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const auth = await autenticarApiKey(req);
  if (!auth.ok) return auth.response;

  // ── Params ────────────────────────────────────────────────────────────────────
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 20)));
  const offset = (page - 1) * perPage;

  const situacao = url.searchParams.get("situacao") ?? "ativo";
  const categoria = url.searchParams.get("categoria");
  const q = url.searchParams.get("q");
  const updatedAfter = url.searchParams.get("updated_after");

  // ── Filtros dinâmicos ─────────────────────────────────────────────────────────
  const filtroPorSituacao =
    situacao === "todos"
      ? sql``
      : situacao === "inativo"
      ? sql`AND p.situacao ILIKE 'inativo'`
      : sql`AND p.situacao ILIKE 'ativo'`;

  const filtroCategoria = categoria
    ? sql`AND p.categoria ILIKE ${"%" + categoria + "%"}`
    : sql``;

  const filtroBusca = q
    ? sql`AND (p.nome ILIKE ${"%" + q + "%"} OR p.sku ILIKE ${"%" + q + "%"})`
    : sql``;

  const filtroUpdated = updatedAfter
    ? sql`AND p.updated_at >= ${updatedAfter}::timestamptz`
    : sql``;

  // ── Count total ───────────────────────────────────────────────────────────────
  const [{ total }] = await sql<{ total: number }[]>`
    SELECT COUNT(*)::int AS total
    FROM public.produtos p
    WHERE 1=1
      ${filtroPorSituacao}
      ${filtroCategoria}
      ${filtroBusca}
      ${filtroUpdated}
  `;

  // ── Busca produtos ────────────────────────────────────────────────────────────
  const produtos = await sql`
    SELECT
      p.id_produto                        AS id,
      p.nome,
      p.sku,
      p.situacao,
      p.tipo_metal,
      p.peso_precificado                  AS peso,
      p.preco_tiny                        AS preco,
      p.preco_total_sync                  AS preco_com_pedras,
      p.tem_pedra_preciosa,
      vc.url_capa                         AS foto,
      COALESCE(vi.imagens, '[]'::jsonb)   AS imagens,
      p.categoria                         AS categoria,
      p.categoria_precificacao            AS categoria_precificacao,
      p.markup,
      p.updated_at
    FROM public.produtos p
    LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
    LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
    WHERE 1=1
      ${filtroPorSituacao}
      ${filtroCategoria}
      ${filtroBusca}
      ${filtroUpdated}
    ORDER BY p.nome ASC
    LIMIT ${perPage} OFFSET ${offset}
  `;

  const base = `${url.origin}/api/v1/produtos`;
  return apiListResponse(produtos, total, page, perPage, base);
}
