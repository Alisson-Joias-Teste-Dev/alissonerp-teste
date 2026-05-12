import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const regras = await sql`
    SELECT
      r.id, r.nome, r.descricao, r.tipo_evento, r.condicao_json,
      r.aprovador_role, r.aprovador_id, ua.nome AS aprovador_nome,
      r.template_id, t.nome AS template_nome,
      r.ativo, r.prioridade_regra,
      r.criado_por, uc.nome AS criador_nome,
      r.created_at, r.updated_at
    FROM alissonerp.tarefas_regras_aprovacao r
    LEFT JOIN alissonerp.usuarios ua ON ua.id = r.aprovador_id
    LEFT JOIN alissonerp.tarefas_templates t ON t.id = r.template_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = r.criado_por
    ORDER BY r.prioridade_regra DESC, r.nome ASC
  `;

  return NextResponse.json(regras);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    nome: string;
    descricao?: string;
    tipo_evento: string;
    condicao_json?: Record<string, unknown>;
    aprovador_role?: string;
    aprovador_id?: string;
    template_id?: number;
    prioridade_regra?: number;
  };

  if (!body.nome?.trim() || !body.tipo_evento?.trim()) {
    return NextResponse.json({ error: "nome e tipo_evento são obrigatórios" }, { status: 400 });
  }

  const [regra] = await sql`
    INSERT INTO alissonerp.tarefas_regras_aprovacao
      (nome, descricao, tipo_evento, condicao_json, aprovador_role,
       aprovador_id, template_id, prioridade_regra, criado_por)
    VALUES (
      ${body.nome.trim()}, ${body.descricao ?? null},
      ${body.tipo_evento.trim()}, ${JSON.stringify(body.condicao_json ?? {})}::jsonb,
      ${body.aprovador_role ?? null}, ${body.aprovador_id ?? null}::uuid,
      ${body.template_id ?? null}, ${body.prioridade_regra ?? 0},
      ${user.id}::uuid
    )
    RETURNING id, nome, created_at
  `;

  return NextResponse.json(regra, { status: 201 });
}
