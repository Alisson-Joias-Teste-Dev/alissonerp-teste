import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ensureTinyToken } from "@/lib/tiny-auth";
import { internalError } from "@/lib/api-error";

// GET /api/admin/tiny-keepalive
// Mantém o token OAuth2 do Tiny renovado proativamente.
// Deve ser chamado a cada ~30 min via cron ou client-side setInterval.
// Roles: apenas admin e desenvolvedor.
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!caller || !["admin", "desenvolvedor"].includes(caller.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const token = await ensureTinyToken();
    const masked = token.slice(0, 10) + "...";
    return NextResponse.json({ ok: true, token_preview: masked });
  } catch (err) {
    return internalError("[GET /api/admin/tiny-keepalive]", err, "Falha ao renovar token");
  }
}
