import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { ROLES_ESTOQUE_MOVIMENTAR, hasRole } from "@/lib/roles";

interface Params { params: Promise<{ id: string }> }

// POST /api/estoque-comercial/transferir/[id]/concluir
// Recebedor confirma a transferência → entrada no destino
export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // BLINDAGEM (v2.81.1): confirmar recebimento gera ENTRADA no destino —
  // é para gerência/estoquista. Antes qualquer usuário logado concluía.
  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!hasRole(usuario?.role, ROLES_ESTOQUE_MOVIMENTAR)) {
    return NextResponse.json({ error: "Sem permissão para receber transferência" }, { status: 403 });
  }

  const { id } = await params;
  const transferId = Number(id);

  const [transf] = await sql`
    SELECT id, status FROM alissonerp.transferencias_estoque_comercial WHERE id = ${transferId}
  `;
  if (!transf) return NextResponse.json({ error: "Transferência não encontrada" }, { status: 404 });
  if (transf.status !== 'pendente') {
    return NextResponse.json({ error: `Transferência já está ${transf.status}` }, { status: 409 });
  }

  // UPDATE status='concluido' → trigger cria entrada no destino
  const [updated] = await sql`
    UPDATE alissonerp.transferencias_estoque_comercial
    SET status = 'concluido', recebido_por = ${user.id}
    WHERE id = ${transferId}
    RETURNING id, recebido_em, movimento_entrada_id
  `;

  return NextResponse.json({ id: updated.id, recebido_em: updated.recebido_em });
}
