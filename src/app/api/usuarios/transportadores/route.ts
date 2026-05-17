import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// GET /api/usuarios/transportadores
// Lista usuários habilitados como transportadores (is_transportador = true)
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const rows = await sql`
    SELECT id, nome, role
    FROM alissonerp.usuarios
    WHERE is_transportador = true AND ativo = true
    ORDER BY nome
  `;
  return NextResponse.json(rows);
}
