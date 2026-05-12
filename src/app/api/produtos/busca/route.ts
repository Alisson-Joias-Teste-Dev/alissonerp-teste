import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/produtos/busca?q=TEXTO&limit=10&com_estoque=true
// Busca rápida de produtos por nome ou SKU (para selects/modais)
// com_estoque=true: retorna apenas produtos com saldo disponivel > 0 na Loja (local=2)
export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const q     = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 50);
  const comEstoque = url.searchParams.get("com_estoque") === "true";

  if (q.length < 2) return NextResponse.json([]);

  const rows = comEstoque ? await sql`
    SELECT p.id_produto, p.nome, p.sku, s.disponivel::int
    FROM public.produtos p
    JOIN alissonerp.vw_saldo_estoque_comercial_v2 s ON s.produto_id = p.id_produto
      AND s.local_estoque_id = 2
    WHERE
      (p.nome ILIKE ${"%" + q + "%"} OR p.sku ILIKE ${"%" + q + "%"})
      AND s.disponivel > 0
    ORDER BY p.nome
    LIMIT ${limit}
  ` : await sql`
    SELECT id_produto, nome, sku
    FROM public.produtos
    WHERE
      nome ILIKE ${"%" + q + "%"}
      OR sku  ILIKE ${"%" + q + "%"}
    ORDER BY nome
    LIMIT ${limit}
  `;

  return NextResponse.json(rows);
}
