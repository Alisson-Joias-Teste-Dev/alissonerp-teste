import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── GET /api/tarefas/[id] ────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefa] = await sql`
    SELECT
      t.*, ur.nome AS responsavel_nome, uc.nome AS criador_nome, o.numero_ordem
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.usuarios ur ON ur.id = t.responsavel_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
    LEFT JOIN alissonerp.ordens o ON o.id = t.ordem_id
    WHERE t.id = ${tarefaId}
  `;
  if (!tarefa) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isOwner = tarefa.responsavel_id === user.id || tarefa.criado_por === user.id;
  if (!isOwner && !isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const comentarios = await sql`
    SELECT c.*, u.nome AS autor_nome
    FROM alissonerp.comentarios_tarefa c
    LEFT JOIN alissonerp.usuarios u ON u.id = c.autor_id
    WHERE c.tarefa_id = ${tarefaId}
    ORDER BY c.created_at ASC
  `;

  return NextResponse.json({ ...tarefa, comentarios });
}

// ─── PATCH /api/tarefas/[id] ──────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefaPatch] = await sql`SELECT responsavel_id, criado_por FROM alissonerp.tarefas WHERE id = ${tarefaId} LIMIT 1`;
  if (!tarefaPatch) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const [usuarioPatch] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isOwnerPatch = tarefaPatch.responsavel_id === user.id || tarefaPatch.criado_por === user.id;
  if (!isOwnerPatch && !isFullAccess(usuarioPatch?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    titulo?: string;
    descricao?: string;
    responsavel_id?: string | null;
    prioridade?: string;
    status?: string;
    data_limite?: string | null;
    ordem_id?: number | null;
    tags?: string[];
  };

  await sql`
    UPDATE alissonerp.tarefas SET
      titulo         = COALESCE(${body.titulo ?? null},         titulo),
      descricao      = COALESCE(${body.descricao ?? null},      descricao),
      responsavel_id = COALESCE(${body.responsavel_id ?? null}::uuid, responsavel_id),
      prioridade     = COALESCE(${body.prioridade ?? null},     prioridade),
      status         = COALESCE(${body.status ?? null},         status),
      data_limite    = COALESCE(${body.data_limite ?? null}::date, data_limite),
      ordem_id       = COALESCE(${body.ordem_id ?? null},       ordem_id),
      tags           = COALESCE(${body.tags ?? null},           tags)
    WHERE id = ${tarefaId}
  `;

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/tarefas/[id] ─────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const tarefaId = Number(id);
  if (isNaN(tarefaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [tarefaDel] = await sql`SELECT criado_por FROM alissonerp.tarefas WHERE id = ${tarefaId} LIMIT 1`;
  if (!tarefaDel) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const [usuarioDel] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isCreator = tarefaDel.criado_por === user.id;
  if (!isCreator && !isFullAccess(usuarioDel?.role)) {
    return NextResponse.json({ error: "Sem permissão — apenas o criador pode excluir" }, { status: 403 });
  }

  await sql`DELETE FROM alissonerp.tarefas WHERE id = ${tarefaId}`;
  return NextResponse.json({ ok: true });
}
