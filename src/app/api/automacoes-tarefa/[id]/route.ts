import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// PATCH /api/automacoes-tarefa/[id] — atualizar automação
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  await sql`
    UPDATE alissonerp.automacoes_tarefa SET
      titulo        = COALESCE(${body.titulo as string ?? null},        titulo),
      descricao     = COALESCE(${body.descricao as string ?? null},     descricao),
      responsavel_id = COALESCE(${body.responsavel_id as string ?? null}::uuid, responsavel_id),
      prioridade    = COALESCE(${body.prioridade as string ?? null},    prioridade),
      recorrencia   = COALESCE(${body.recorrencia as string ?? null},   recorrencia),
      dia_semana    = COALESCE(${body.dia_semana as number ?? null},    dia_semana),
      dia_mes       = COALESCE(${body.dia_mes as number ?? null},       dia_mes),
      ativa         = COALESCE(${body.ativa as boolean ?? null},        ativa),
      tags          = COALESCE(${body.tags as string[] ?? null},        tags),
      updated_at    = now()
    WHERE id = ${Number(id)}
  `;

  return NextResponse.json({ ok: true });
}

// DELETE /api/automacoes-tarefa/[id] — deletar automação
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  await sql`DELETE FROM alissonerp.automacoes_tarefa WHERE id = ${Number(id)}`;

  return NextResponse.json({ ok: true });
}
