import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// ─── GET /api/tarefas ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const responsavel = url.searchParams.get("responsavel_id");
  const prioridade = url.searchParams.get("prioridade");
  const ordem_id = url.searchParams.get("ordem_id");

  // Admin/dev/gerente veem tudo; outros só suas tarefas
  const fullAccess = usuario && isFullAccess(usuario.role);
  const gerente = usuario && ["gerente_fabrica", "gerente_loja"].includes(usuario.role);

  const tarefas = await sql`
    SELECT
      t.id, t.titulo, t.descricao, t.prioridade, t.status,
      t.data_limite, t.ordem_id, t.tags, t.created_at, t.updated_at, t.concluida_em,
      t.responsavel_id, t.criado_por,
      ur.nome AS responsavel_nome,
      uc.nome AS criador_nome,
      o.numero_ordem
    FROM alissonerp.tarefas t
    LEFT JOIN alissonerp.usuarios ur ON ur.id = t.responsavel_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = t.criado_por
    LEFT JOIN alissonerp.ordens o ON o.id = t.ordem_id
    WHERE 1=1
      ${status ? sql`AND t.status = ${status}` : sql``}
      ${prioridade ? sql`AND t.prioridade = ${prioridade}` : sql``}
      ${ordem_id ? sql`AND t.ordem_id = ${Number(ordem_id)}` : sql``}
      ${responsavel ? sql`AND t.responsavel_id = ${responsavel}::uuid` : sql``}
      ${!fullAccess && !gerente ? sql`AND (t.responsavel_id = ${user.id}::uuid OR t.criado_por = ${user.id}::uuid)` : sql``}
    ORDER BY
      CASE t.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
      t.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(tarefas);
}

// ─── POST /api/tarefas ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    titulo: string;
    descricao?: string;
    responsavel_id?: string;
    prioridade?: string;
    data_limite?: string;
    ordem_id?: number;
    tags?: string[];
  };

  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
  }

  const [tarefa] = await sql`
    INSERT INTO alissonerp.tarefas
      (titulo, descricao, responsavel_id, criado_por, prioridade, data_limite, ordem_id, tags)
    VALUES (
      ${body.titulo.trim()},
      ${body.descricao ?? null},
      ${body.responsavel_id ?? null}::uuid,
      ${user.id}::uuid,
      ${body.prioridade ?? "media"},
      ${body.data_limite ?? null},
      ${body.ordem_id ?? null},
      ${body.tags ?? []}
    )
    RETURNING id, titulo, status, prioridade, created_at
  `;

  // Notificar responsável se diferente do criador
  if (body.responsavel_id && body.responsavel_id !== user.id) {
    await sql`
      INSERT INTO alissonerp.notificacoes
        (usuario_id, tipo, titulo, mensagem, remetente_id)
      VALUES (
        ${body.responsavel_id}::uuid,
        'tarefa',
        ${"Nova tarefa atribuída"},
        ${body.titulo.trim()},
        ${user.id}::uuid
      )
    `.catch(() => { /* notificação não bloqueia criação */ });
  }

  return NextResponse.json(tarefa, { status: 201 });
}
