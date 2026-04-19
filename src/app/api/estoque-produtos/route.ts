/**
 * GET /api/estoque-produtos
 *
 * Dashboard de estoque de produtos acabados:
 *   - JOIN public.estoque (saldo) + public.produtos (nome, preco_tiny, data_ultima_compra)
 *   - Somente produtos com saldo > 0
 *   - Retorna itens paginados + KPIs agregados (total_valor, total_skus, total_pecas)
 *
 * Query params:
 *   busca   → ILIKE em nome/sku
 *   order   → sku | nome | saldo | preco_tiny | valor_total | data_ultima_compra
 *   dir     → asc | desc (default desc)
 *   page    → 1..N (default 1)
 *   limit   → 1..200 (default 50)
 *
 * Acesso: admin | desenvolvedor (isFullAccess)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

const ORDER_WHITELIST = [
  "sku",
  "nome",
  "saldo",
  "preco_tiny",
  "valor_total",
  "data_ultima_compra",
] as const;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const busca = sp.get("busca")?.trim() ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const orderParam = (sp.get("order") ?? "valor_total") as typeof ORDER_WHITELIST[number];
  const orderField = ORDER_WHITELIST.includes(orderParam) ? orderParam : "valor_total";
  const dir = sp.get("dir") === "asc" ? sql`ASC` : sql`DESC`;

  const orderIdent =
    orderField === "sku" ? sql`e.sku` :
    orderField === "nome" ? sql`p.nome` :
    orderField === "saldo" ? sql`e.saldo` :
    orderField === "preco_tiny" ? sql`p.preco_tiny` :
    orderField === "data_ultima_compra" ? sql`p.data_ultima_compra` :
    sql`valor_total`;

  const wBusca = busca
    ? sql`AND (p.nome ILIKE ${"%" + busca + "%"} OR e.sku ILIKE ${"%" + busca + "%"})`
    : sql``;

  try {
    // KPIs agregados (sobre TODO o filtro, sem paginação)
    const [agg] = await sql<{
      total_valor: string | null;
      total_skus: number;
      total_pecas: number;
      skus_sem_preco: number;
    }[]>`
      SELECT
        COALESCE(SUM(e.saldo * COALESCE(p.preco_tiny, 0)), 0)::numeric(14,2) AS total_valor,
        COUNT(*)::int AS total_skus,
        COALESCE(SUM(e.saldo), 0)::int AS total_pecas,
        COUNT(*) FILTER (WHERE p.preco_tiny IS NULL OR p.preco_tiny = 0)::int AS skus_sem_preco
      FROM public.estoque e
      JOIN public.produtos p ON p.id_api_produto = e.produto_id_api
      WHERE e.saldo > 0
        ${wBusca}
    `;

    // Itens paginados
    const itens = await sql<{
      id_produto: string;
      sku: string;
      nome: string | null;
      saldo: number;
      preco_tiny: string | null;
      valor_total: string;
      data_ultima_compra: string | null;
    }[]>`
      SELECT
        p.id_produto,
        e.sku,
        p.nome,
        e.saldo,
        p.preco_tiny,
        (e.saldo * COALESCE(p.preco_tiny, 0))::numeric(14,2) AS valor_total,
        p.data_ultima_compra
      FROM public.estoque e
      JOIN public.produtos p ON p.id_api_produto = e.produto_id_api
      WHERE e.saldo > 0
        ${wBusca}
      ORDER BY ${orderIdent} ${dir} NULLS LAST, e.sku ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const totalPages = Math.ceil((agg.total_skus || 0) / limit);

    return NextResponse.json({
      kpis: {
        total_valor: Number(agg.total_valor ?? 0),
        total_skus: agg.total_skus,
        total_pecas: agg.total_pecas,
        skus_sem_preco: agg.skus_sem_preco,
      },
      itens,
      page,
      limit,
      totalPages,
      order: orderField,
      dir: sp.get("dir") === "asc" ? "asc" : "desc",
    });
  } catch (err) {
    console.error("[GET /api/estoque-produtos]", err);
    return NextResponse.json({ error: "Erro ao buscar estoque" }, { status: 500 });
  }
}
