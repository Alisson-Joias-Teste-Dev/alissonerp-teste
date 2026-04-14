import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/tarefas/[id]/aprovacao — lista aprovações da tarefa
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const aprovacoes = await sql`
    SELECT
      a.id, a.tarefa_id, a.status, a.motivo, a.created_at, a.respondido_em,
      us.nome AS solicitante_nome,
      ua.nome AS aprovador_nome,
      a.solicitante_id, a.aprovador_id
    FROM alissonerp.aprovacoes_tarefa a
    LEFT JOIN alissonerp.usuarios us ON us.id = a.solicitante_id
    LEFT JOIN alissonerp.usuarios ua ON ua.id = a.aprovador_id
    WHERE a.tarefa_id = ${Number(id)}
    ORDER BY a.created_at DESC
  `;

  return NextResponse.json(aprovacoes);
}

// POST /api/tarefas/[id]/aprovacao — solicitar aprovação
// Body: { aprovador_id: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { aprovador_id: string };

  if (!body.aprovador_id) {
    return NextResponse.json({ error: "aprovador_id obrigatório" }, { status: 400 });
  }

  // Atualizar status da tarefa para aguardando_aprovacao
  await sql`
    UPDATE alissonerp.tarefas SET status = 'aguardando_aprovacao', updated_at = now()
    WHERE id = ${Number(id)}
  `;

  const [aprovacao] = await sql`
    INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
    VALUES (${Number(id)}, ${user.id}::uuid, ${body.aprovador_id}::uuid, 'pendente')
    RETURNING id
  `;

  // Notificar aprovador
  await sql`
    INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
    VALUES (${body.aprovador_id}::uuid, 'aprovacao', 'Aprovação solicitada',
      (SELECT titulo FROM alissonerp.tarefas WHERE id = ${Number(id)}),
      ${user.id}::uuid)
  `.catch(() => {});

  return NextResponse.json({ id: aprovacao.id }, { status: 201 });
}

// PATCH /api/tarefas/[id]/aprovacao — responder aprovação (aprovar/rejeitar)
// Body: { aprovacao_id: number, decisao: 'aprovado'|'rejeitado', motivo?: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { aprovacao_id: number; decisao: "aprovado" | "rejeitado"; motivo?: string };

  if (!body.aprovacao_id || !body.decisao) {
    return NextResponse.json({ error: "aprovacao_id e decisao obrigatórios" }, { status: 400 });
  }

  // Verificar que o usuário é o aprovador
  const [aprovacao] = await sql`
    SELECT * FROM alissonerp.aprovacoes_tarefa
    WHERE id = ${body.aprovacao_id} AND tarefa_id = ${Number(id)}
  `;
  if (!aprovacao) return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
  if (String(aprovacao.aprovador_id) !== user.id) {
    return NextResponse.json({ error: "Somente o aprovador pode responder" }, { status: 403 });
  }

  await sql`
    UPDATE alissonerp.aprovacoes_tarefa
    SET status = ${body.decisao}, motivo = ${body.motivo ?? null}, respondido_em = now()
    WHERE id = ${body.aprovacao_id}
  `;

  // Atualizar status da tarefa
  const novoStatus = body.decisao === "aprovado" ? "concluida" : "em_andamento";
  await sql`
    UPDATE alissonerp.tarefas SET status = ${novoStatus}, updated_at = now()
    ${body.decisao === "aprovado" ? sql`, concluida_em = now()` : sql``}
    WHERE id = ${Number(id)}
  `;

  // ── Hook: aprovação de crédito (venda vinculada à tarefa) ────────────────
  const [tarefaInfo] = await sql`
    SELECT venda_id FROM alissonerp.tarefas WHERE id = ${Number(id)}
  `;
  if (tarefaInfo?.venda_id) {
    try {
      const { processarAprovacaoCredito } = await import("@/lib/vendas-credito-aprovar");
      const resultado = await processarAprovacaoCredito(
        Number(id), user.id, body.decisao, body.motivo,
      );
      return NextResponse.json({ ok: true, credito: resultado });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[aprovacao] Erro ao processar crédito:`, msg);
      // Não falha silenciosamente — retorna erro pra UI mostrar
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // Notificar solicitante (fluxo normal sem venda)
  await sql`
    INSERT INTO alissonerp.notificacoes (usuario_id, tipo, titulo, mensagem, remetente_id)
    VALUES (${String(aprovacao.solicitante_id)}::uuid, 'aprovacao',
      ${body.decisao === "aprovado" ? "Tarefa aprovada!" : "Tarefa rejeitada"},
      ${body.motivo ?? (body.decisao === "aprovado" ? "Aprovada com sucesso" : "Rejeitada pelo aprovador")},
      ${user.id}::uuid)
  `.catch(() => {});

  return NextResponse.json({ ok: true });
}
