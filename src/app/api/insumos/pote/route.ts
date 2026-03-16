import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/insumos/pote — saldo total por categoria (vw_saldo_pote)
export async function GET() {
  const rows = await sql`
    SELECT * FROM alissonerp.vw_saldo_pote ORDER BY categoria_nome
  `;
  return NextResponse.json(rows);
}
