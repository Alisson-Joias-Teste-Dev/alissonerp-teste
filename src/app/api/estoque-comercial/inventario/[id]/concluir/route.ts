import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { ROLE_OPERADOR_INVENTARIO, ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";
import { executarConcluirInventario, InventarioAcaoError, statsConclusaoInventario } from "@/lib/inventario-acoes";
import { criarSolicitacaoInventario } from "@/lib/inventario-solicitacoes";
import { zodError } from "@/lib/schemas/common";

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/estoque-comercial/inventario/[id]/concluir
 *
 * O QUÊ: conclui o inventário — congela a contagem como registro de auditoria.
 *   NÃO gera ajuste de estoque (decisão de negócio: inventário é auditoria,
 *   ajustes são feitos manualmente item a item depois de investigar).
 * POR QUÊ: concluir é irreversível; num estoque de milhões não pode ser
 *   possível "fechar" com itens sem contagem ou pendências sem resposta
 *   sem uma confirmação explícita e registrada.
 * IMPACTO SE ALTERADO: conclusões precipitadas escondem divergências.
 *
 * Blindagem: se houver itens NÃO CONTADOS ou PENDÊNCIAS SEM RESPOSTA,
 *   retorna 409 com os números — o cliente precisa reenviar com
 *   { forcar: true } para concluir mesmo assim (fica gravado na auditoria
 *   que foi forçado e por quem).
 */
const ConcluirSchema = z.object({
  forcar: z.boolean().optional().default(false),
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
  const parsed = ConcluirSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { forcar } = parsed.data;

  try {
    /**
     * OPERADOR DE INVENTÁRIO (v2.83.0): não conclui direto — o pedido vira
     * tarefa de aprovação com o placar (divergentes/sem contagem/pendências)
     * no resumo; a aprovação do admin é a confirmação explícita.
     */
    if (isOperador) {
      const [inv] = await sql`SELECT id, status FROM alissonerp.inventarios_comercial WHERE id = ${invId}`;
      if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
      if (inv.status === "concluido" || inv.status === "cancelado") {
        return NextResponse.json({ error: `Inventário já está ${inv.status}` }, { status: 409 });
      }
      const stats = await statsConclusaoInventario(invId);
      const resumo = [
        `Ação: CONCLUIR inventário #${invId}`,
        `Divergentes: ${stats.divergentes}`,
        `Sem contagem: ${stats.nao_contados}`,
        `Pendências sem resposta: ${stats.pendencias_abertas}`,
        "",
        "Ao aprovar, a contagem é congelada como auditoria (NENHUM ajuste de estoque).",
      ].join("\n");
      const solic = await criarSolicitacaoInventario({
        tipoAcao: "concluir",
        inventarioId: invId,
        payload: { forcar: true, stats },
        resumo,
        user,
      });
      return NextResponse.json(
        { solicitado: true, ...solic, mensagem: "Pedido de conclusão enviado para aprovação do administrador" },
        { status: 202 },
      );
    }

    const resultado = await executarConcluirInventario({ invId, forcar, userId: user.id });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof InventarioAcaoError) {
      const extra = e as InventarioAcaoError & { requer_confirmacao?: boolean; stats?: { divergentes: number; nao_contados: number; pendencias_abertas: number } };
      return NextResponse.json({
        error: e.message,
        ...(extra.requer_confirmacao ? {
          requer_confirmacao: true,
          nao_contados: extra.stats?.nao_contados,
          pendencias_abertas: extra.stats?.pendencias_abertas,
        } : {}),
      }, { status: e.status });
    }
    throw e;
  }
}
