import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// PATCH /api/notificacoes/[id]/ler — marca notificação como lida (somente dono)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const [notif] = await sql`
    SELECT usuario_id FROM alissonerp.notificacoes WHERE id = ${parseInt(id)}
  `;
  if (!notif)
    return NextResponse.json(
      { error: "Notificação não encontrada" },
      { status: 404 }
    );
  if (notif.usuario_id !== user.id)
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await sql`
    UPDATE alissonerp.notificacoes SET lida = true, lida_em = now() WHERE id = ${parseInt(id)}
  `;
  return NextResponse.json({ success: true });
}
