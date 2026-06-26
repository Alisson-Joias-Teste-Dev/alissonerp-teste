import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { criarNotificacao } from "@/lib/notificacoes";

// POST /api/automacoes-tarefa/[id]/executar — execução manual (cria tarefa agora)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const [automacao] = await sql`
    SELECT * FROM alissonerp.automacoes_tarefa WHERE id = ${Number(id)} LIMIT 1
  `;
  if (!automacao) return NextResponse.json({ error: "Automação não encontrada" }, { status: 404 });

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, tags)
    VALUES (
      ${automacao.titulo as string},
      ${automacao.descricao as string | null},
      ${automacao.responsavel_id as string | null}::uuid,
      ${user.id}::uuid,
      ${automacao.prioridade as string},
      ${automacao.tags as string[]}
    )
    RETURNING id, titulo
  `;

  await sql`
    INSERT INTO alissonerp.automacoes_execucoes (automacao_id, tarefa_id, executado_em)
    VALUES (${Number(id)}, ${tarefa.id as number}, CURRENT_DATE)
  `;

  await sql`
    UPDATE alissonerp.automacoes_tarefa SET ultima_execucao = CURRENT_DATE WHERE id = ${Number(id)}
  `;

  if (automacao.responsavel_id && String(automacao.responsavel_id) !== user.id) {
    await criarNotificacao({
      usuarioId: String(automacao.responsavel_id),
      tipo: "tarefa",
      titulo: "Nova tarefa automática",
      mensagem: automacao.titulo as string,
      remetenteId: user.id,
      link: `/tarefas?abrir=${tarefa.id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ tarefa_id: tarefa.id, titulo: tarefa.titulo }, { status: 201 });
}
