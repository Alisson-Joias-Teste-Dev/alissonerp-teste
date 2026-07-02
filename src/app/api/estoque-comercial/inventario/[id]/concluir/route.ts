import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import { ROLES_INVENTARIO_GERENTES, hasRole } from "@/lib/roles";
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

  if (!hasRole(user.role, ROLES_INVENTARIO_GERENTES)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const invId = Number(id);

  const [inv] = await sql`
    SELECT id, status, local_estoque_id
    FROM alissonerp.inventarios_comercial WHERE id = ${invId}
  `;
  if (!inv) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });
  if (inv.status === "concluido") {
    return NextResponse.json({ error: "Inventário já concluído" }, { status: 409 });
  }
  if (inv.status === "cancelado") {
    return NextResponse.json({ error: "Inventário cancelado" }, { status: 409 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ConcluirSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { forcar } = parsed.data;

  const [stats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE diferenca != 0 AND quantidade_contada IS NOT NULL) AS divergentes,
      COUNT(*) FILTER (WHERE quantidade_contada IS NULL)                        AS nao_contados,
      COUNT(*) FILTER (WHERE pendencia_obs IS NOT NULL
                         AND pendencia_resolvida IS NULL)                       AS pendencias_abertas
    FROM alissonerp.itens_inventario_comercial
    WHERE inventario_id = ${invId}
  `;
  const naoContados = Number(stats.nao_contados);
  const pendenciasAbertas = Number(stats.pendencias_abertas);

  // Trava de segurança: só conclui "sujo" com confirmação explícita (forcar)
  if (!forcar && (naoContados > 0 || pendenciasAbertas > 0)) {
    return NextResponse.json({
      error: "Inventário tem itens sem contagem ou pendências sem resposta",
      requer_confirmacao: true,
      nao_contados: naoContados,
      pendencias_abertas: pendenciasAbertas,
    }, { status: 409 });
  }

  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE alissonerp.inventarios_comercial
      SET status = 'concluido', data_conclusao = now(), concluido_por = ${user.id}::uuid
      WHERE id = ${invId}
    `;
    await logAudit(tx, {
      tabela: "inventarios_comercial",
      operacao: "UPDATE",
      registro_id: invId,
      usuario_id: user.id,
      dados_antes: { status: inv.status },
      dados_depois: {
        status: "concluido",
        forcado: forcar,
        divergentes: Number(stats.divergentes),
        nao_contados: naoContados,
        pendencias_abertas: pendenciasAbertas,
      },
    });
  });

  // Resposta honesta: inventário NÃO gera ajuste automático de estoque
  return NextResponse.json({
    id: invId,
    divergentes: Number(stats.divergentes),
    nao_contados: naoContados,
    pendencias_abertas: pendenciasAbertas,
    ajustes_gerados: 0,
  });
}
