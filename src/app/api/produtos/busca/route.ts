import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/produtos/busca?q=TEXTO&limit=10
// Busca rápida de produtos por nome ou SKU (para selects/modais)
export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const q     = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 50);

  if (q.length < 2) return NextResponse.json([]);

  const rows = await sql`
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
