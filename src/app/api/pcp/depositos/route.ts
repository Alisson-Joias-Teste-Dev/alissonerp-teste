import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/depositos
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const rows = await sql`
    SELECT id, nome, tipo
    FROM alissonerp.depositos
    WHERE ativo = true
    ORDER BY id
  `;
  return NextResponse.json(rows);
}
