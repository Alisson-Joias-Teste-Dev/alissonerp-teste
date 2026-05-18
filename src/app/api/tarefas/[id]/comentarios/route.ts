import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const TarefaComentarioSchema = z.object({
  texto: z.string().min(1, "obrigatório"),
}).passthrough();

// ─── POST /api/tarefas/[id]/comentarios ───────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefa] = await sql`SELECT id FROM alissonerp.tarefas WHERE id = ${tarefaId}`;
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const raw = await req.json().catch(() => ({}));
  const parsed = TarefaComentarioSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const [comentario] = await sql`
    INSERT INTO alissonerp.comentarios_tarefa (tarefa_id, autor_id, texto)
    VALUES (${tarefaId}, ${user.id}::uuid, ${body.texto.trim()})
    RETURNING id, created_at
  `;

  return NextResponse.json(comentario, { status: 201 });
}
