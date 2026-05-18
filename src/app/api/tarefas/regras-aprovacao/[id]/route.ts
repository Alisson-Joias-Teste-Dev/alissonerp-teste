import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const RegraAprovacaoPatchSchema = z.object({
  nome: z.string().optional(),
  descricao: z.string().optional(),
  tipo_evento: z.string().optional(),
  condicao_json: z.record(z.string(), z.unknown()).optional(),
  aprovador_role: z.string().nullable().optional(),
  aprovador_id: z.string().nullable().optional(),
  template_id: z.coerce.number().int().nullable().optional(),
  prioridade_regra: z.coerce.number().int().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const regraId = Number(id);
  if (isNaN(regraId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = RegraAprovacaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  await sql`
    UPDATE alissonerp.tarefas_regras_aprovacao SET
      nome             = COALESCE(${body.nome ?? null}, nome),
      descricao        = COALESCE(${body.descricao ?? null}, descricao),
      tipo_evento      = COALESCE(${body.tipo_evento ?? null}, tipo_evento),
      condicao_json    = COALESCE(${body.condicao_json ? JSON.stringify(body.condicao_json) : null}::jsonb, condicao_json),
      aprovador_role   = COALESCE(${body.aprovador_role ?? null}, aprovador_role),
      aprovador_id     = COALESCE(${body.aprovador_id ?? null}::uuid, aprovador_id),
      template_id      = COALESCE(${body.template_id ?? null}, template_id),
      prioridade_regra = COALESCE(${body.prioridade_regra ?? null}, prioridade_regra),
      ativo            = COALESCE(${body.ativo ?? null}, ativo),
      updated_at       = now()
    WHERE id = ${regraId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const regraId = Number(id);
  if (isNaN(regraId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  await sql`DELETE FROM alissonerp.tarefas_regras_aprovacao WHERE id = ${regraId}`;
  return NextResponse.json({ ok: true });
}
