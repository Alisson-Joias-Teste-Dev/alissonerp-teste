import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const userId = user.id;

  const baseFilter = (usuario?.role === "admin" || usuario?.role === "desenvolvedor")
    ? sql``
    : sql`WHERE (t.responsavel_id = ${userId}::uuid OR t.criado_por = ${userId}::uuid)`;

  const [totais] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status = 'pendente')::int AS pendentes,
      COUNT(*) FILTER (WHERE t.status = 'em_andamento')::int AS em_andamento,
      COUNT(*) FILTER (WHERE t.status = 'aguardando_aprovacao')::int AS aguardando_aprovacao,
      COUNT(*) FILTER (WHERE t.status = 'concluida')::int AS concluidas,
      COUNT(*) FILTER (WHERE t.status = 'cancelada')::int AS canceladas,
      COUNT(*) FILTER (WHERE t.status = 'vencida' OR (t.data_limite < CURRENT_DATE AND t.status NOT IN ('concluida','cancelada','vencida','aprovada')))::int AS vencidas,
      COUNT(*) FILTER (WHERE t.status = 'aguardando_aprovacao' AND t.responsavel_id = ${userId}::uuid)::int AS aguardando_minha_aprovacao,
      COUNT(*) FILTER (WHERE (t.responsavel_id = ${userId}::uuid OR t.criado_por = ${userId}::uuid) AND t.status IN ('pendente','em_andamento'))::int AS minhas_pendentes
    FROM alissonerp.tarefas t
    ${baseFilter}
  `;

  return NextResponse.json(totais);
}
