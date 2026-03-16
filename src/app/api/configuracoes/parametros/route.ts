import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

async function authCheck() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) return null;
  return user;
}

// PATCH /api/configuracoes/parametros
// Body: { ouro, dollar, euro, prata }
export async function PATCH(req: NextRequest) {
  const user = await authCheck();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as {
    ouro?: number;
    dollar?: number;
    euro?: number;
    prata?: number;
  };

  const { ouro, dollar, euro, prata } = body;

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
