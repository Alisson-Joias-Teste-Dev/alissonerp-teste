import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/notificacoes/contagem — conta notificações não lidas do usuário logado
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [result] = await sql`
    SELECT COUNT(*)::int AS nao_lidas FROM alissonerp.notificacoes
    WHERE usuario_id = ${user.id}::uuid AND lida = false
  `;

  return NextResponse.json({ nao_lidas: result.nao_lidas });
}
