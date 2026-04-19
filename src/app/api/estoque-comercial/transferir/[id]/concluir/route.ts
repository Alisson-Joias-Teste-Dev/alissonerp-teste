import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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
