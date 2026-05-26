import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

// REGRA DE NEGOCIO:
// - O que faz: registra recebimento da compra comercial e auditoria do usuario.
// - Por que: separa etapa de conferencia da etapa de conclusao com efeitos financeiros.
// - Impacto se alterado/removido: fluxo operacional perde controle de quem recebeu e quando.

type Params = Promise<{ id: string }>;

const ReceberPatchSchema = z.object({
  data_recebimento: z.string().nullable().optional(),
}).passthrough();

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const compraId = parseInt(id);

  const raw = await req.json().catch(() => ({}));
  const parsed = ReceberPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { data_recebimento } = parsed.data;

  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras_comercial WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite alteração" }, { status: 409 });
  if (compra.situacao !== "rascunho" && compra.situacao !== "pendente") {
    return NextResponse.json(
      { error: `Compra está em situação "${compra.situacao}" — somente rascunho/pendente pode ser recebida` },
      { status: 409 },
    );
  }

  const [updated] = await sql`
    UPDATE alissonerp.compras_comercial
    SET
      situacao = 'recebida',
      data_recebimento = COALESCE(${data_recebimento ?? null}, CURRENT_DATE),
      recebido_por = ${user.id}::uuid
    WHERE id = ${compraId}
      AND bloqueado = false
    RETURNING *
  `;

  if (!updated) return NextResponse.json({ error: "Não foi possível atualizar a compra" }, { status: 500 });

  return NextResponse.json(updated);
}
