import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/notificacoes?lida=false — lista notificações do usuário logado
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lida = searchParams.get("lida");

  let notificacoes;
  if (lida === "false") {
    notificacoes = await sql`
      SELECT n.*, u.nome AS remetente_nome
      FROM alissonerp.notificacoes n
      LEFT JOIN alissonerp.usuarios u ON u.id = n.remetente_id
      WHERE n.usuario_id = ${user.id}::uuid AND n.lida = false
      ORDER BY n.created_at DESC
      LIMIT 50
    `;
  } else {
    notificacoes = await sql`
      SELECT n.*, u.nome AS remetente_nome
      FROM alissonerp.notificacoes n
      LEFT JOIN alissonerp.usuarios u ON u.id = n.remetente_id
      WHERE n.usuario_id = ${user.id}::uuid
      ORDER BY n.created_at DESC
      LIMIT 50
    `;
  }

  return NextResponse.json(notificacoes);
}
