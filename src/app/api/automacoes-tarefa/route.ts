import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/automacoes-tarefa — listar automações
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const automacoes = await sql`
    SELECT
      a.id, a.titulo, a.descricao, a.prioridade, a.recorrencia,
      a.dia_semana, a.dia_mes, a.tags, a.ativa, a.ultima_execucao,
      a.created_at, a.updated_at,
      a.responsavel_id, ur.nome AS responsavel_nome,
      a.criado_por, uc.nome AS criador_nome,
      COUNT(e.id) AS total_execucoes
    FROM alissonerp.automacoes_tarefa a
    LEFT JOIN alissonerp.usuarios ur ON ur.id = a.responsavel_id
    LEFT JOIN alissonerp.usuarios uc ON uc.id = a.criado_por
    LEFT JOIN alissonerp.automacoes_execucoes e ON e.automacao_id = a.id
    GROUP BY a.id, ur.nome, uc.nome
    ORDER BY a.ativa DESC, a.created_at DESC
  `;

  return NextResponse.json(automacoes.map(a => ({
    ...a,
    total_execucoes: Number(a.total_execucoes),
  })));
}

// POST /api/automacoes-tarefa — criar automação
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const PODE = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || !PODE.includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas gerentes podem criar automações" }, { status: 403 });
  }

  const body = await req.json() as {
    titulo: string;
    descricao?: string;
    responsavel_id?: string;
    prioridade?: string;
    recorrencia: string;
    dia_semana?: number;
    dia_mes?: number;
    tags?: string[];
  };

  if (!body.titulo?.trim()) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
  if (!["diaria", "semanal", "mensal"].includes(body.recorrencia)) {
    return NextResponse.json({ error: "recorrencia deve ser: diaria, semanal ou mensal" }, { status: 400 });
  }

  const [automacao] = await sql`
    INSERT INTO alissonerp.automacoes_tarefa
      (titulo, descricao, responsavel_id, prioridade, recorrencia, dia_semana, dia_mes, tags, criado_por)
    VALUES (
      ${body.titulo.trim()},
      ${body.descricao ?? null},
      ${body.responsavel_id ?? null}::uuid,
      ${body.prioridade ?? "media"},
      ${body.recorrencia},
      ${body.dia_semana ?? null},
      ${body.dia_mes ?? null},
      ${body.tags ?? []},
      ${user.id}::uuid
    )
    RETURNING id
  `;

  return NextResponse.json({ id: automacao.id }, { status: 201 });
}
