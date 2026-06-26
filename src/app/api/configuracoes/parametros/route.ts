import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ParametrosPatchSchema = z.object({
  ouro: z.coerce.number().optional(),
  dollar: z.coerce.number().optional(),
  euro: z.coerce.number().optional(),
  prata: z.coerce.number().optional(),
}).passthrough();

// PATCH /api/configuracoes/parametros
// Body: { ouro, dollar, euro, prata }
export async function PATCH(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ParametrosPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { ouro, dollar, euro, prata } = parsed.data;

  await sql`
    UPDATE public.parametros
    SET
      ouro   = COALESCE(${ouro   ?? null}, ouro),
      dollar = COALESCE(${dollar ?? null}, dollar),
      euro   = COALESCE(${euro   ?? null}, euro),
      prata  = COALESCE(${prata  ?? null}, prata)
  `;

  const [updated] = await sql`SELECT * FROM public.parametros LIMIT 1`;
  return NextResponse.json({ ok: true, parametros: updated });
}
