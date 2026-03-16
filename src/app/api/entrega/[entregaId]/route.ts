import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/entrega/[entregaId] — concluir entrega
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entregaId: string }> }
) {
  const { entregaId } = await params;
  const id = parseInt(entregaId);
  const { etapas } = await req.json() as { etapas: string };

  const rows = await sql`
    UPDATE alissonerp.preparacoes_entrega
    SET etapas = ${etapas}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, etapas, ordem_id
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  }

  // Ao concluir a entrega, a ordem chega ao fim do fluxo → status=concluido
  if (etapas === "concluido" && rows[0].ordem_id) {
    await sql`
      UPDATE alissonerp.ordens SET
        status         = 'concluido',
        data_conclusao = now(),
        updated_at     = now()
      WHERE id = ${rows[0].ordem_id}
    `;
  }

  return NextResponse.json(rows[0]);
}
