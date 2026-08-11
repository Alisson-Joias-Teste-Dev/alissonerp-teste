import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLE_OPERADOR_INVENTARIO, ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";
import { executarCancelarInventario, InventarioAcaoError } from "@/lib/inventario-acoes";
import { criarSolicitacaoInventario } from "@/lib/inventario-solicitacoes";
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

  const isOperador = user.role === ROLE_OPERADOR_INVENTARIO;
  if (!isOperador && !hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const raw = await req.json().catch(() => ({}));
  const parsed = CancelarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { motivo } = parsed.data;

  try {
    /**
     * OPERADOR DE INVENTÁRIO (v2.83.0): não cancela direto — cancelar joga
     * fora uma contagem inteira, então o pedido (com o motivo) vira tarefa
     * de aprovação do administrador.
     */
    if (isOperador) {
      const [inv] = await sql`SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}`;
      if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
      if (inv.status === "concluido" || inv.status === "cancelado") {
        return NextResponse.json({ error: `Inventário já está ${inv.status}` }, { status: 409 });
      }
      const resumo = [
        `Ação: CANCELAR inventário #${invId}`,
        `Motivo do operador: ${motivo}`,
        "",
        "Ao aprovar, o inventário é cancelado (a contagem feita é descartada).",
      ].join("\n");
      const solic = await criarSolicitacaoInventario({
        tipoAcao: "cancelar",
        inventarioId: invId,
        payload: { motivo },
        resumo,
        user,
      });
      return NextResponse.json(
        { solicitado: true, ...solic, mensagem: "Pedido de cancelamento enviado para aprovação do administrador" },
        { status: 202 },
      );
    }

    const resultado = await executarCancelarInventario({ invId, motivo, userId: user.id });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof InventarioAcaoError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
