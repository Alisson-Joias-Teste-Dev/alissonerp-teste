import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

type Params = Promise<{ id: string; itemId: string }>;

// DELETE /api/compras/[id]/itens/[itemId]
export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const { id, itemId } = await params;
  const compraId  = parseInt(id);
  const itemIdNum = parseInt(itemId);

  // Verificar se compra está bloqueada
  const [compra] = await sql`
    SELECT bloqueado FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  await sql`DELETE FROM alissonerp.itens_compra WHERE id = ${itemIdNum} AND compra_id = ${compraId}`;

  return NextResponse.json({ ok: true });
}
