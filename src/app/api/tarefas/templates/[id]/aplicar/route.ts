import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function POST(
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

  const [template] = await sql`
    SELECT * FROM alissonerp.tarefas_templates WHERE id = ${templateId} AND ativo = true
  `;
  if (!template) return NextResponse.json({ error: "Template não encontrado ou inativo" }, { status: 404 });

  const body = await req.json().catch(() => ({})) as {
    responsavel_id?: string;
    data_limite?: string;
    variaveis?: Record<string, string>;
  };

  const variaveis = body.variaveis ?? {};

  let titulo = template.titulo_padrao;
  let descricao = template.descricao_padrao;

  for (const [chave, valor] of Object.entries(variaveis)) {
    titulo = titulo.replaceAll(`{${chave}}`, String(valor));
    if (descricao) descricao = descricao.replaceAll(`{${chave}}`, String(valor));
  }

  const responsavelId = body.responsavel_id ?? template.responsavel_default_id;

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, data_limite, tags, tipo)
    VALUES (
      ${titulo}, ${descricao ?? null},
      ${responsavelId ?? null}::uuid, ${user.id}::uuid,
      ${template.prioridade ?? 'media'}, ${body.data_limite ?? null},
      ${template.tags ?? []}, ${template.tipo ?? null}
    )
    RETURNING id, titulo, status, prioridade, tipo, created_at
  `;

  if (responsavelId && responsavelId !== user.id) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id)
      VALUES (
        ${responsavelId}::uuid, 'tarefa',
        'Nova tarefa (template)', ${titulo},
        ${user.id}::uuid
      )
    `.catch(() => {});
  }

  return NextResponse.json(tarefa, { status: 201 });
}
