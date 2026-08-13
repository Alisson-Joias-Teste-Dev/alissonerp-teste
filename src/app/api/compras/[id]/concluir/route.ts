import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";

type Params = Promise<{ id: string }>;

// PATCH /api/compras/[id]/concluir
// Seta situacao='concluido' → trigger trg_concluir_compra gera CE de estoque
//                           → trigger trg_aa_bloquear_compra seta bloqueado=true
// Aceita situacao 'recebida' OU 'rascunho'/'pendente' (backward compat)
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra já bloqueada" }, { status: 409 });
  if (compra.situacao === "concluido") return NextResponse.json({ error: "Compra já concluída" }, { status: 409 });

  // Aceitar: recebida, rascunho ou pendente (backward compat)
  const situacoesPermitidas = ["recebida", "rascunho", "pendente"];
  if (!situacoesPermitidas.includes(compra.situacao as string)) {
    return NextResponse.json(
      { error: `Compra está em situação "${compra.situacao}" — não pode ser concluída` },
      { status: 409 },
    );
  }

  try {
    await sql`UPDATE alissonerp.compras SET situacao = 'concluido' WHERE id = ${compraId}`;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string };
    // Trigger trg_aa_bloquear_compra lança exception se bloqueado=true
    if (error.message?.includes("bloqueado") || error.code === "P0001") {
      return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
    }
    return internalError("[PATCH /api/compras/[id]/concluir]", err);
  }
}
