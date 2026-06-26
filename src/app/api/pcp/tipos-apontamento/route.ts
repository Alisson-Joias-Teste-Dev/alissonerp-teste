import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/tipos-apontamento
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const rows = await sql`
    SELECT id, descricao, scope
    FROM alissonerp.tipos_apontamento
    WHERE scope IN ('pcp', 'ambos')
      AND ativo = true
    ORDER BY id
  `;
  return NextResponse.json(rows);
}
