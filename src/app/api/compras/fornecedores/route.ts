import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// GET /api/compras/fornecedores
// Retorna lista de contatos (fornecedores) para o select da Nova Compra.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rows = await sql`
    SELECT id_contato, nome
    FROM public.contatos
    WHERE nome IS NOT NULL
    ORDER BY nome
    LIMIT 500
  `;
  return NextResponse.json(rows);
}
