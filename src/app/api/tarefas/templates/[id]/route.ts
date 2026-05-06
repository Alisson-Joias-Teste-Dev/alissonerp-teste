import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

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

  const body = await req.json() as {
    nome?: string;
    descricao?: string;
    titulo_padrao?: string;
    descricao_padrao?: string;
    prioridade?: string;
    responsavel_default_id?: string | null;
    tags?: string[];
    tipo?: string;
    ativo?: boolean;
  };

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
