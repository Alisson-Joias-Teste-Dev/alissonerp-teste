import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// REGRA DE NEGOCIO:
// - O que faz: remove item da compra comercial apenas antes do bloqueio/conclusao.
// - Por que: evita alterar custo e quantidade depois de gerar estoque/financeiro.
// - Impacto se alterado/removido: risco de divergencia entre compra, estoque comercial e contas a pagar.

type Params = Promise<{ id: string; itemId: string }>;

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id, itemId } = await params;
  const compraId = parseInt(id);
  const itemIdNum = parseInt(itemId);

  const [compra] = await sql`
    SELECT bloqueado FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  const result = await sql`
    DELETE FROM alissonerp.itens_compra_comercial WHERE id = ${itemIdNum} AND compra_comercial_id = ${compraId}
    RETURNING id
  `;
  if (result.length === 0) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
