import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

type Params = Promise<{ id: string }>;

// PATCH /api/compras/[id]/receber
// Marca a compra como 'recebida' (novo estado intermediário antes de concluir).
// Body: { data_recebimento?: string (ISO date), recebido_por?: string (uuid) }
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const { data_recebimento, recebido_por } = await req.json() as {
    data_recebimento?: string | null;
    recebido_por?: string | null;
  };

  // Verificar existência e estado
  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) {
    return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  }
  if (compra.bloqueado) {
    return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
  }
  if (compra.situacao !== "rascunho" && compra.situacao !== "pendente") {
    return NextResponse.json(
      { error: `Compra está em situação "${compra.situacao}" — somente rascunho/pendente pode ser recebida` },
      { status: 409 },
    );
  }

  const [updated] = await sql`
    UPDATE alissonerp.compras
    SET
      situacao         = 'recebida',
      data_recebimento = COALESCE(${data_recebimento ?? null}, CURRENT_DATE),
      recebido_por     = ${recebido_por ?? null}::uuid
    WHERE id = ${compraId}
      AND bloqueado = false
    RETURNING *
  `;

  if (!updated) {
    return NextResponse.json({ error: "Não foi possível atualizar a compra" }, { status: 500 });
  }

  return NextResponse.json(updated);
}
