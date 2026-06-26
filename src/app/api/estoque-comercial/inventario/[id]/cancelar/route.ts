import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES_GERENTES = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// POST /api/estoque-comercial/inventario/[id]/cancelar
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
    SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === 'concluido') {
    return NextResponse.json({ error: "Não é possível cancelar inventário já concluído" }, { status: 409 });
  }
  if (inv.status === 'cancelado') {
    return NextResponse.json({ error: "Inventário já cancelado" }, { status: 409 });
  }

  await sql`
    UPDATE alissonerp.inventarios_comercial
    SET status = 'cancelado', data_conclusao = now()
    WHERE id = ${invId}
  `;

  return NextResponse.json({ id: invId, status: 'cancelado' });
}
