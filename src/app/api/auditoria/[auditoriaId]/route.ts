import sql from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const AuditoriaPatchSchema = z.object({
  situacao: z.string().min(1, "obrigatório"),
  parecer: z.string().nullable().optional(),
  motivo_reprovacao: z.string().nullable().optional(),
}).passthrough();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ auditoriaId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { auditoriaId } = await params;
  const id = parseInt(auditoriaId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  const parsed = AuditoriaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { situacao, parecer, motivo_reprovacao } = parsed.data;

  const rows = await sql`
    UPDATE alissonerp.auditorias
    SET
      situacao            = ${situacao},
      parecer             = ${parecer ?? null},
      motivo_reprovacao   = ${motivo_reprovacao ?? null},
      data_conclusao      = CASE WHEN ${situacao} IN ('aprovado','reprovado') THEN now() ELSE data_conclusao END
    WHERE id = ${id}
    RETURNING id, situacao
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}
