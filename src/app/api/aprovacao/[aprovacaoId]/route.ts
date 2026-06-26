import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";
import { isFullAccess } from "@/lib/roles";

const AprovacaoPatchSchema = z.object({
  etapas: z.string().min(1, "obrigatório"),
}).passthrough();

// PATCH /api/aprovacao/[aprovacaoId] — aprovar consultora
// REGRA DE NEGOCIO:
// - O que faz: valida quem pode aprovar/reprovar conferencias de consultora.
// - Por que: gerencia/admin conferem qualquer consultora, mas consultora so pode
//   aprovar a propria conferencia vinculada ao seu vendedor_id.
// - Impacto se removido: qualquer usuario autenticado poderia alterar status de
//   aprovacao ou consultora poderia aprovar conferencia de outra consultora.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ aprovacaoId: string }> }
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { aprovacaoId } = await params;
  const id = parseInt(aprovacaoId);

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const role = usuario?.role as string | undefined;
  const podeAprovarTodas = isFullAccess(role) || ["gerente_loja", "gerente_fabrica"].includes(role ?? "");
  let podeAprovarPropria = false;

  if (role === "consultora" && usuario.vendedor_id != null) {
    const [aprovacao] = await sql`
      SELECT consultora_id
      FROM alissonerp.aprovacoes_consultora
      WHERE id = ${id}
      LIMIT 1
    `;
    podeAprovarPropria = aprovacao?.consultora_id === usuario.vendedor_id;
  }

  if (!usuario || (!podeAprovarTodas && !podeAprovarPropria)) {
    return NextResponse.json({ error: "Sem permissão para aprovar consultora" }, { status: 403 });
  }

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
