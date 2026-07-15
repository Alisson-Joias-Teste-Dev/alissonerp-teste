import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";

type Params = Promise<{ id: string }>;

// REGRA DE NEGOCIO:
// - O que faz: conclui compra comercial e aciona triggers de entrada no estoque + contas a pagar mensal.
// - Por que: evita operacao manual em dois modulos criticos (estoque e financeiro).
// - Impacto se alterado/removido: produto pode nao entrar em estoque e contas a pagar podem nao ser geradas.
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra já bloqueada" }, { status: 409 });
  if (compra.situacao === "concluido") return NextResponse.json({ error: "Compra já concluída" }, { status: 409 });

  // REGRA DE NEGOCIO (Fase 4, item 1):
  // - O que faz: aceita concluir a partir de "aprovado" e "recebido_pendente_cadastro" alem dos estados
  //   ja aceitos ("recebida", "rascunho", "pendente") — confirmado em supabase/migrations/331 que a
  //   trigger fn_concluir_compra_comercial permite concluir a partir de rascunho/recebida/
  //   recebido_pendente_cadastro/aprovado.
  // - Por que: sem "aprovado", uma compra com peso divergente que foi aprovada formalmente travava
  //   aqui com 409 mesmo estando num estado que o banco aceita.
  // - Impacto se alterado/removido: compra aprovada por peso divergente fica presa, sem conseguir
  //   dar entrada em estoque/contas a pagar.
  const situacoesPermitidas = ["recebida", "rascunho", "pendente", "aprovado", "recebido_pendente_cadastro"];
  if (!situacoesPermitidas.includes(compra.situacao as string)) {
    return NextResponse.json(
      { error: `Compra está em situação "${compra.situacao}" — não pode ser concluída` },
      { status: 409 },
    );
  }

  try {
    await sql`UPDATE alissonerp.compras_comercial SET situacao = 'concluido' WHERE id = ${compraId}`;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const error = err as { message?: string; code?: string };
    if (error.message?.includes("bloqueado") || error.code === "P0001") {
      return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
    }
    return internalError("[PATCH /api/compras-comercial/[id]/concluir]", err);
  }
}
