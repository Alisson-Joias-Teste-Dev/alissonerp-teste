import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES_PERMITIDOS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// POST /api/estoque-comercial/transferir/[id]/cancelar
// Cancela transferência pendente → estorna saída do local de origem
export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES_PERMITIDOS.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const transferId = Number(id);

  const [transf] = await sql`
    SELECT id, status FROM alissonerp.transferencias_estoque_comercial WHERE id = ${transferId}
  `;
  if (!transf) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });
  if (transf.status !== 'pendente') {
    return NextResponse.json({ error: `Só é possível cancelar transferências pendentes. Status atual: ${transf.status}` }, { status: 409 });
  }

  // UPDATE status='cancelado' → trigger estorna a saída
  const [updated] = await sql`
    UPDATE alissonerp.transferencias_estoque_comercial
    SET status = 'cancelado'
    WHERE id = ${transferId}
    RETURNING id, cancelado_em
  `;

  return NextResponse.json({ id: updated.id, cancelado_em: updated.cancelado_em });
}
