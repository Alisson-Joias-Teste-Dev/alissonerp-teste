import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// GET /api/dashboard-comercial/premiacao
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;
  const [row] = await sql<Array<{ texto: string }>>`
    SELECT texto FROM alissonerp.config_premiacao WHERE id = 1
  `;
  return NextResponse.json({ texto: row?.texto ?? "" });
}

// PATCH /api/dashboard-comercial/premiacao
// Body: { texto: string }
export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { texto } = await req.json() as { texto: string };
  if (typeof texto !== "string") return NextResponse.json({ error: "Campo texto obrigatório" }, { status: 400 });

  await sql`
    UPDATE alissonerp.config_premiacao
    SET texto = ${texto}, updated_at = now()
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
