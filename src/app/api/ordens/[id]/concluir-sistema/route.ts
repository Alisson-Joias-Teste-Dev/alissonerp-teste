import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isMasterAdmin } from "@/lib/master-admin";

/**
 * REGRA DE NEGÓCIO — Conclusão forçada por sistema (somente Master Admin)
 *
 * O QUE: permite concluir uma ordem travada em todas as etapas operacionais
 * vinculadas (PCP, protocolo, auditoria, aprovação consultora e entrega).
 *
 * POR QUE: quando o fluxo fica preso por falha operacional humana, as ordens
 * acumulam no funil e bloqueiam o andamento geral da fábrica/loja.
 *
 * IMPACTO SE REMOVIDO: o dono perde o mecanismo de contingência para
 * destravar gargalos rapidamente e as ordens podem permanecer entulhadas no
 * sistema por tempo indeterminado.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `;

  /**
   * REGRA DE NEGÓCIO: conclusão forçada é restrita ao dono; desenvolvedor é
   * fallback técnico controlado para contingência de permissão.
   *
   * O QUE: permite execução por master admin e, em ambiente interno, por
   * desenvolvedor.
   * POR QUE: garante continuidade operacional caso o MASTER_ADMIN_USER_ID
   * esteja temporariamente divergente.
   * IMPACTO SE REMOVIDO: bloqueio total da rotina de destravamento em cenários
   * urgentes de produção.
   */
  const permitido = await isMasterAdmin(user.id) || usuario?.role === "desenvolvedor";
  if (!permitido) {
    return NextResponse.json(
      { error: "Ação restrita ao master admin" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const ordemId = Number(id);
  if (!Number.isFinite(ordemId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const observacaoSistema = `\n[CONCLUÍDA PELO SISTEMA em ${new Date().toISOString()} por ${user.id}]`;

  const resultado = await sql.begin(async (tx: any) => {
    const [ordem] = await tx`
      SELECT id, status
      FROM alissonerp.ordens
      WHERE id = ${ordemId}
      LIMIT 1
    `;

    if (!ordem) {
      return { notFound: true };
    }

    /**
     * REGRA DE NEGÓCIO: concluir todas as etapas em uma única transação.
     *
     * O QUE: atualiza todos os módulos vinculados à ordem para estado final,
     * com rastreabilidade "Concluída pelo sistema".
     * POR QUE: evita estado parcialmente concluído (ordem concluída, mas etapa
     * intermediária pendente) que volta a entulhar o funil.
     * IMPACTO SE REMOVIDO: inconsistência de status entre módulos e reabertura
     * de pendências fantasma no rastreio de ordens.
     */
    const pcpRows = await tx`
      UPDATE alissonerp.pcp
      SET etapas = 'concluido',
          data_conclusao = COALESCE(data_conclusao, now()),
          updated_at = now()
      WHERE ordem_id = ${ordemId}
        AND etapas <> 'concluido'
      RETURNING id
    `;

    const protocoloRows = await tx`
      UPDATE alissonerp.protocolos p
      SET etapas = 'concluido',
          updated_at = now()
      WHERE p.id IN (
        SELECT po.protocolo_id
        FROM alissonerp.protocolo_ordens po
        WHERE po.ordem_id = ${ordemId}
      )
        AND p.etapas <> 'concluido'
      RETURNING id
    `;

    const auditoriaRows = await tx`
      UPDATE alissonerp.auditorias
      SET situacao = 'aprovado',
          parecer = COALESCE(NULLIF(parecer, ''), 'Concluída pelo sistema'),
          data_conclusao = COALESCE(data_conclusao, now())
      WHERE ordem_id = ${ordemId}
        AND situacao IN ('pendente', 'em_analise', 'pendenciado')
      RETURNING id
    `;

    const aprovacaoRows = await tx`
      UPDATE alissonerp.aprovacoes_consultora
      SET etapas = 'aprovado'
      WHERE ordem_id = ${ordemId}
        AND etapas IN ('pendente', 'aguardando')
      RETURNING id
    `;

    const entregaRows = await tx`
      UPDATE alissonerp.preparacoes_entrega
      SET etapas = 'concluido',
          updated_at = now()
      WHERE ordem_id = ${ordemId}
        AND etapas <> 'concluido'
      RETURNING id
    `;

    await tx`
      UPDATE alissonerp.ordens
      SET status = 'concluido',
          data_conclusao = COALESCE(data_conclusao, now()),
          detalhes_ordem = COALESCE(detalhes_ordem, '') || ${observacaoSistema},
          updated_at = now()
      WHERE id = ${ordemId}
    `;

    /**
     * REGRA DE NEGÓCIO: sweep final de PCP para blindar kanban de rota.
     *
     * O QUE: reaplica conclusão em qualquer PCP da ordem que tenha ficado
     * ativo após atualizações intermediárias do fluxo.
     * POR QUE: evita que OF reapareça em "Novas Ordens" no PCP depois da
     * conclusão forçada da ordem.
     * IMPACTO SE REMOVIDO: ordem concluída pode continuar entulhando o PCP,
     * gerando retrabalho operacional.
     */
    const pcpSweepRows = await tx`
      UPDATE alissonerp.pcp
      SET etapas = 'concluido',
          data_conclusao = COALESCE(data_conclusao, now()),
          updated_at = now()
      WHERE ordem_id = ${ordemId}
        AND etapas <> 'concluido'
      RETURNING id
    `;

    /**
     * REGRA DE NEGÓCIO: conclusão forçada de REPOSIÇÃO dá ENTRADA no estoque.
     *
     * O QUE: ao concluir a ordem pelo sistema, se ela for de reposição
     * (reposicao_venda/reposicao_loja), dá entrada da peça no estoque comercial
     * (almox. 2) — o mesmo que o protocolo de volta faria no fluxo normal.
     * POR QUE: este botão PULA o protocolo de volta. Sem a entrada, a peça da
     * reposição nunca aparece no estoque e a entrega da venda quebra com
     * STOCK_NEGATIVE (caso C-2372). A função fn_reposicao_entrada_estoque é
     * idempotente (não dobra se a volta também concluir).
     * IMPACTO SE REMOVIDO: reposição forçada conclui sem peça no estoque →
     * entrega da venda travada.
     */
    const [entradaRepos] = await tx`
      SELECT alissonerp.fn_reposicao_entrada_estoque(${ordemId}, ${user.id}::uuid) AS criadas
    `;

    return {
      notFound: false,
      ordem_id: ordemId,
      pcp_concluidos: pcpRows.length,
      pcp_concluidos_sweep_final: pcpSweepRows.length,
      protocolos_concluidos: protocoloRows.length,
      auditorias_concluidas: auditoriaRows.length,
      aprovacoes_concluidas: aprovacaoRows.length,
      entregas_concluidas: entregaRows.length,
      entradas_estoque_reposicao: entradaRepos?.criadas ?? 0,
    };
  });

  if (resultado?.notFound) {
    return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...resultado });
}
