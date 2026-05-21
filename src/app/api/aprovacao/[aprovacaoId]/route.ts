import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401, ForbiddenError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { isFullAccess } from "@/lib/roles";

const AprovacaoPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
}).passthrough();

// PATCH /api/aprovacao/[aprovacaoId] — aprovar consultora
// REGRA DE NEGÓCIO (Bug 5): verifica permissão antes de aprovar.
// Antes QUALQUER usuário autenticado podia chamar este endpoint.
// Agora só gerente_loja, gerente_fabrica, admin e desenvolvedor.
// Se alterar: manter a verificação de role — consultora não pode auto-aprovar.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ aprovacaoId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !isFullAccess(usuario.role) && !["gerente_loja", "gerente_fabrica"].includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para aprovar consultora" }, { status: 403 });
  }

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
