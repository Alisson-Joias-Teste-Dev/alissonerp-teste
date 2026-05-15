import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const tarefaId = Number(id);
    if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

    const historico = await sql`
      SELECT
        h.id, h.acao, h.campo, h.valor_anterior, h.valor_novo, h.comentario, h.created_at,
        u.nome AS usuario_nome
      FROM alissonerp.tarefas_historico h
      LEFT JOIN alissonerp.usuarios u ON u.id = h.usuario_id
      WHERE h.tarefa_id = ${tarefaId}
      ORDER BY h.created_at DESC
      LIMIT 100
    `;
    return NextResponse.json(historico);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GET /api/tarefas/[id]/historico]`, msg);
    return NextResponse.json([]);
  }
}
