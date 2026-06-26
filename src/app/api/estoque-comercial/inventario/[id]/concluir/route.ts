import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES_GERENTES = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// POST /api/estoque-comercial/inventario/[id]/concluir
// Conclui o inventario — registra divergencias mas NAO ajusta estoque automaticamente
export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_GERENTES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT id, status, local_estoque_id
    FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === "concluido") {
    return NextResponse.json({ error: "Inventário já concluído" }, { status: 409 });
  }
  if (inv.status === "cancelado") {
    return NextResponse.json({ error: "Inventário cancelado" }, { status: 409 });
  }

  // Contar divergencias para o relatorio (sem gerar ajustes de estoque)
  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE diferenca != 0 AND diferenca IS NOT NULL) AS divergentes,
      COUNT(*) FILTER (WHERE quantidade_contada IS NULL)               AS nao_contados
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId}
  `;

  // Concluir inventario
  await sql`
    UPDATE alissonerp.inventarios_comercial
    SET status = 'concluido', data_conclusao = now(), concluido_por = ${user.id}
    WHERE id = ${invId}
  `;

  return NextResponse.json({
    id: invId,
    divergentes: Number(stats.divergentes),
    nao_contados: Number(stats.nao_contados),
    ajustes_gerados: 0,  // inventario nao ajusta estoque automaticamente
  });
}
