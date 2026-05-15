import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/insumos?categoria_id=1
export async function GET(req: NextRequest) {
  const categoria_id = req.nextUrl.searchParams.get("categoria_id");

  const rows = categoria_id
    ? await sql`
        SELECT id, nome, sku, categoria_id, peso_pedra, peso_pedra_ct
        FROM alissonerp.insumos
        WHERE ativo = true
          AND categoria_id = ${parseInt(categoria_id)}
        ORDER BY nome
      `
    : await sql`
        SELECT id, nome, sku, categoria_id, peso_pedra, peso_pedra_ct
        FROM alissonerp.insumos
        WHERE ativo = true
        ORDER BY nome
      `;

  return NextResponse.json(rows);
}
