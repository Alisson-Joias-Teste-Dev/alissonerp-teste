import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

type Params = Promise<{ id: string }>;

const ReceberPatchSchema = z.object({
  data_recebimento: z.string().nullable().optional(),
}).passthrough();

// PATCH /api/compras/[id]/receber
// Marca a compra como 'recebida' (novo estado intermediário antes de concluir).
// Body: { data_recebimento?: string (ISO date) }
// recebido_por vem da sessao autenticada (nunca do body)
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const compraId = parseInt(id);

  const raw = await req.json().catch(() => ({}));
  const parsed = ReceberPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { data_recebimento } = parsed.data;
  const recebido_por = user.id;

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
