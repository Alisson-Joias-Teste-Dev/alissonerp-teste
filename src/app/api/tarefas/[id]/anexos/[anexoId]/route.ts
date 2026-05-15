import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; anexoId: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id, anexoId } = await params;
  const tarefaId = Number(id);
  const anexoNum = Number(anexoId);
  if (isNaN(tarefaId) || isNaN(anexoNum)) {
    return NextResponse.json({ error: "IDs inválidos" }, { status: 400 });
  }

  const [anexo] = await sql`
    SELECT id FROM alissonerp.tarefas_anexos
    WHERE id = ${anexoNum} AND tarefa_id = ${tarefaId}
  `;
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });

  await sql`DELETE FROM alissonerp.tarefas_anexos WHERE id = ${anexoNum}`;
  return NextResponse.json({ ok: true });
}
