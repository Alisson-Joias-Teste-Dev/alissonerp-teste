import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const TarefaTemplatePatchSchema = z.object({
  nome: z.string().optional(),
  descricao: z.string().optional(),
  titulo_padrao: z.string().optional(),
  descricao_padrao: z.string().optional(),
  prioridade: z.string().optional(),
  responsavel_default_id: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tipo: z.string().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const templateId = Number(id);
  if (isNaN(templateId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [template] = await sql`
    SELECT t.*, u.nome AS responsavel_default_nome
    FROM alissonerp.tarefas_templates t
    LEFT JOIN alissonerp.usuarios u ON u.id = t.responsavel_default_id
    WHERE t.id = ${templateId}
  `;
  if (!template) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });

  return NextResponse.json(template);
}

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
  const templateId = Number(id);
  if (isNaN(templateId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = TarefaTemplatePatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  await sql`
    UPDATE alissonerp.tarefas_templates SET
      nome                  = COALESCE(${body.nome ?? null}, nome),
      descricao             = COALESCE(${body.descricao ?? null}, descricao),
      titulo_padrao         = COALESCE(${body.titulo_padrao ?? null}, titulo_padrao),
      descricao_padrao      = COALESCE(${body.descricao_padrao ?? null}, descricao_padrao),
      prioridade            = COALESCE(${body.prioridade ?? null}, prioridade),
      responsavel_default_id = COALESCE(${body.responsavel_default_id ?? null}::uuid, responsavel_default_id),
      tags                  = COALESCE(${body.tags ?? null}, tags),
      tipo                  = COALESCE(${body.tipo ?? null}, tipo),
      ativo                 = COALESCE(${body.ativo ?? null}, ativo),
      updated_at            = now()
    WHERE id = ${templateId}
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
  const templateId = Number(id);
  if (isNaN(templateId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  await sql`DELETE FROM alissonerp.tarefas_templates WHERE id = ${templateId}`;
  return NextResponse.json({ ok: true });
}
