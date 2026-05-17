import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/insumos/categorias — lista categorias distintas do pote
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const rows = await sql`
    SELECT DISTINCT categoria_id, categoria_nome
    FROM alissonerp.vw_detalhe_pote
    ORDER BY categoria_nome
  `;
  return NextResponse.json(rows);
}
