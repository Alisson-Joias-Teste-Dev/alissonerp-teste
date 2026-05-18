import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const EntregaPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
}).passthrough();

// PATCH /api/entrega/[entregaId] — concluir entrega
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ entregaId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { entregaId } = await params;
  const id = parseInt(entregaId);
  const raw = await req.json().catch(() => ({}));
  const parsed = EntregaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { etapas } = parsed.data;

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
