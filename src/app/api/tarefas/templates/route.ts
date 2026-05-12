import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const templates = await sql`
    SELECT
      t.id, t.nome, t.descricao, t.titulo_padrao, t.descricao_padrao,
      t.prioridade, t.tipo, t.tags, t.ativo,
      t.responsavel_default_id, u.nome AS responsavel_default_nome,
      t.criado_por, uc.nome AS criador_nome, t.created_at, t.updated_at
    FROM alissonerp.tarefas_templates t
    LEFT JOIN alissonerp.usuarios u ON u.id = t.responsavel_default_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
    ORDER BY t.nome ASC
  `;

  return NextResponse.json(templates);
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
    titulo_padrao: string;
    descricao_padrao?: string;
    prioridade?: string;
    responsavel_default_id?: string;
    tags?: string[];
    tipo?: string;
  };

  if (!body.nome?.trim() || !body.titulo_padrao?.trim()) {
    return NextResponse.json({ error: "nome e titulo_padrao são obrigatórios" }, { status: 400 });
  }

  const [template] = await sql`
    INSERT INTO alissonerp.tarefas_templates
      (nome, descricao, titulo_padrao, descricao_padrao, prioridade,
       responsavel_default_id, tags, tipo, criado_por)
    VALUES (
      ${body.nome.trim()}, ${body.descricao ?? null}, ${body.titulo_padrao.trim()},
      ${body.descricao_padrao ?? null}, ${body.prioridade ?? 'media'},
      ${body.responsavel_default_id ?? null}::uuid, ${body.tags ?? []},
      ${body.tipo ?? null}, ${user.id}::uuid
    )
    RETURNING id, nome, created_at
  `;

  return NextResponse.json(template, { status: 201 });
}
