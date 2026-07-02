import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/estoque-comercial/inventario/[id]/cancelar
 *
 * O QUÊ: cancela um inventário aberto/em contagem, com MOTIVO obrigatório
 *   e registro de QUEM cancelou.
 * POR QUÊ: cancelar descarta uma contagem inteira — num estoque de milhões
 *   isso não pode ser anônimo nem sem justificativa (cancelamento é a forma
 *   mais fácil de "sumir" com uma divergência incômoda).
 * IMPACTO SE ALTERADO: cancelamentos voltam a ser anônimos e sem trilha.
 */
const CancelarSchema = z.object({
  motivo: z.string().trim().min(5, "informe o motivo do cancelamento").max(1000),
});

export async function POST(req: NextRequest, { params }: Params) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === "concluido") {
    return NextResponse.json({ error: "Não é possível cancelar inventário já concluído" }, { status: 409 });
  }
  if (inv.status === "cancelado") {
    return NextResponse.json({ error: "Inventário já cancelado" }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CancelarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { motivo } = parsed.data;

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.inventarios_comercial
      SET status = 'cancelado',
          data_conclusao = now(),
          cancelado_por = ${user.id}::uuid,
          motivo_cancelamento = ${motivo}
      WHERE id = ${invId}
    `;
    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "UPDATE",
      registro_id: invId,
      usuario_id: user.id,
      dados_antes: { status: inv.status },
      dados_depois: { status: "cancelado", motivo_cancelamento: motivo },
    });
  });

  return NextResponse.json({ id: invId, status: "cancelado" });
}
