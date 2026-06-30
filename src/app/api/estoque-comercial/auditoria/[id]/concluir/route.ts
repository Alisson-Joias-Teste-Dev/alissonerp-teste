import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES = ["desenvolvedor", "admin", "gerente_loja"];

export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT id, status FROM alissonerp.auditorias_estoque WHERE id = ${auditoriaId}
  `;
  if (!auditoria) {
    return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  }
  if (auditoria.status !== "em_andamento") {
    return NextResponse.json({ error: "Auditoria não está em andamento" }, { status: 409 });
  }

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL AND validado = false)::int AS itens_divergentes,
      COUNT(*) FILTER (WHERE quantidade_contada IS NOT NULL)::int AS itens_contados,
      COUNT(*)::int AS total_itens
    FROM alissonerp.auditorias_estoque_itens
    WHERE auditoria_id = ${auditoriaId}
  `;

  await sql`
    UPDATE alissonerp.auditorias_estoque
    SET status = 'concluido',
        data_conclusao = now(),
        concluido_por = ${user.id},
        itens_contados = ${stats.itens_contados},
        itens_divergentes = ${stats.itens_divergentes}
    WHERE id = ${auditoriaId}
  `;

  return NextResponse.json({
    id: auditoriaId,
    status: "concluido",
    itens_divergentes: stats.itens_divergentes,
    itens_contados: stats.itens_contados,
    total_itens: stats.total_itens,
  });
}
