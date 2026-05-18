import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const TarefaTemplatePostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  descricao: z.string().optional(),
  titulo_padrao: z.string().min(1, "obrigatório"),
  descricao_padrao: z.string().optional(),
  prioridade: z.string().optional(),
  responsavel_default_id: z.string().optional(),
  tags: z.array(z.string()).optional(),
  tipo: z.string().optional(),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = TarefaTemplatePostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

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
