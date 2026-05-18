import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const AprovacaoPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
}).passthrough();

// PATCH /api/aprovacao/[aprovacaoId] — aprovar consultora
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ aprovacaoId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { aprovacaoId } = await params;
  const id = parseInt(aprovacaoId);
  const raw = await req.json().catch(() => ({}));
  const parsed = AprovacaoPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { etapas } = parsed.data;

  const rows = await sql`
    UPDATE alissonerp.aprovacoes_consultora
    SET etapas = ${etapas}
    WHERE id = ${id}
    RETURNING id, etapas
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
