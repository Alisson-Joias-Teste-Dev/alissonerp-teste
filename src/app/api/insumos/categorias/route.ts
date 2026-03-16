import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/insumos/categorias — lista categorias distintas do pote
export async function GET() {
  const rows = await sql`
    SELECT DISTINCT categoria_id, categoria_nome
    FROM alissonerp.vw_detalhe_pote
    ORDER BY categoria_nome
  `;
  return NextResponse.json(rows);
}
