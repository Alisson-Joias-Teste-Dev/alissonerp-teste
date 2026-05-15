import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/configuracoes/sistema
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [row] = await sql`
    SELECT comentarios_ordens_ativo FROM alissonerp.config_sistema WHERE id = 1
  `;
  return NextResponse.json({
    comentarios_ordens_ativo: row?.comentarios_ordens_ativo ?? true,
  });
}

// PATCH /api/configuracoes/sistema
// Body: { comentarios_ordens_ativo?: boolean }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role::text AS role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!isFullAccess(u?.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json() as { comentarios_ordens_ativo?: boolean };

  if (typeof body.comentarios_ordens_ativo === "boolean") {
    await sql`
      UPDATE alissonerp.config_sistema
      SET comentarios_ordens_ativo = ${body.comentarios_ordens_ativo}, updated_at = now()
      WHERE id = 1
    `;
  }

  const [row] = await sql`SELECT comentarios_ordens_ativo FROM alissonerp.config_sistema WHERE id = 1`;
  return NextResponse.json({ ok: true, comentarios_ordens_ativo: row?.comentarios_ordens_ativo ?? true });
}
