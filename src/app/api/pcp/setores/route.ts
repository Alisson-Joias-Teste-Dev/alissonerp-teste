import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/setores?deposito_id=X
export async function GET(req: NextRequest) {
  const depositoId = req.nextUrl.searchParams.get("deposito_id");

  const rows = depositoId
    ? await sql<{ id: number; nome: string }[]>`
        SELECT id, nome
        FROM alissonerp.setores
        WHERE ativo = true AND deposito_id = ${parseInt(depositoId)}
        ORDER BY id
      `
    : await sql<{ id: number; nome: string }[]>`
        SELECT id, nome
        FROM alissonerp.setores
        WHERE ativo = true
        ORDER BY id
      `;

  return NextResponse.json(rows);
}
