import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// PATCH /api/notificacoes/ler-todas — marca todas as notificações como lidas
export async function PATCH(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const result = await sql`
    UPDATE alissonerp.notificacoes
    SET lida = true, lida_em = now()
    WHERE usuario_id = ${user.id}::uuid AND lida = false
  `;

  return NextResponse.json({ success: true, atualizadas: result.count });
}
