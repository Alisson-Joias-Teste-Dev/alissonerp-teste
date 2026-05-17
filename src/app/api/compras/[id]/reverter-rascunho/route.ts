import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

type Params = Promise<{ id: string }>;

// PATCH /api/compras/[id]/reverter-rascunho
// Reverte uma compra 'recebida' de volta para 'rascunho', apagando data_recebimento e recebido_por.
// NÃO permite reverter compras concluídas/bloqueadas.
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);
  if (isNaN(compraId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [compra] = await sql`
    SELECT id, situacao, bloqueado FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;

  if (!compra) {
    return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  }

  if (compra.bloqueado || compra.situacao === "concluida" || compra.situacao === "concluido") {
    return NextResponse.json({ error: "Compra concluída não pode ser revertida" }, { status: 409 });
  }

  if (compra.situacao === "rascunho") {
    return NextResponse.json({ error: "Compra já está em rascunho" }, { status: 400 });
  }

  if (compra.situacao !== "recebida") {
    return NextResponse.json(
      { error: "Apenas compras recebidas podem ser revertidas para rascunho" },
      { status: 400 },
    );
  }

  const [updated] = await sql`
    UPDATE alissonerp.compras
    SET
      situacao         = 'rascunho',
      data_recebimento = NULL,
      recebido_por     = NULL
    WHERE id = ${compraId}
      AND bloqueado = false
    RETURNING *
  `;

  if (!updated) {
    return NextResponse.json({ error: "Não foi possível reverter a compra" }, { status: 500 });
  }

  return NextResponse.json(updated);
}
