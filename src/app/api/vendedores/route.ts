import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/vendedores — lista vendedores para dropdown
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const rows = await sql`
    SELECT id_vendedor, nome
    FROM public.vendedores
    WHERE situacao = 'Ativo'
    ORDER BY nome
  `;
  return NextResponse.json(rows);
}
