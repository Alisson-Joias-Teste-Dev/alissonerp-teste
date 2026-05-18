import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const PremiacaoPatchSchema = z.object({
  texto: z.string(),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = PremiacaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { texto } = parsed.data;

  await sql`
    UPDATE alissonerp.config_premiacao
    SET texto = ${texto}, updated_at = now()
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
