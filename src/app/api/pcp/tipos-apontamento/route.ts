import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/tipos-apontamento
export async function GET() {
  const rows = await sql`
    SELECT id, descricao, scope
    FROM alissonerp.tipos_apontamento
    WHERE scope IN ('pcp', 'ambos')
      AND ativo = true
    ORDER BY id
  `;
  return NextResponse.json(rows);
}
