import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

type Params = Promise<{ id: string }>;

// PATCH /api/compras/[id]/concluir
// Seta situacao='concluido' → trigger trg_concluir_compra gera CE de estoque
//                           → trigger trg_aa_bloquear_compra seta bloqueado=true
export async function PATCH(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra já bloqueada" }, { status: 409 });
  if (compra.situacao === "concluido") return NextResponse.json({ error: "Compra já concluída" }, { status: 409 });

  try {
    await sql`UPDATE alissonerp.compras SET situacao = 'concluido' WHERE id = ${compraId}`;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Trigger trg_aa_bloquear_compra lança exception se bloqueado=true
    if (err.message?.includes("bloqueado") || err.code === "P0001") {
      return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
