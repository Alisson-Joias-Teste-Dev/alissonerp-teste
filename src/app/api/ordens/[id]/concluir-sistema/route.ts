import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isMasterAdmin } from "@/lib/master-admin";

/**
 * REGRA DE NEGÓCIO — Conclusão forçada por sistema (somente Master Admin)
 *
 * O QUE: conclui uma ordem travada A PARTIR DO PASSO ATUAL da timeline, seguindo
 * a sequência real (auditoria loja → protocolo ida → PCP → auditoria fábrica →
 * protocolo volta → aprovação consultora → preparação entrega). Os passos que já
 * ficaram para trás NÃO são tocados. Registra QUEM apertou o botão (nome), no
 * lugar do antigo "concluída pelo sistema".
 *
 * POR QUE: quando o fluxo trava por falha operacional humana, as ordens acumulam
 * no funil. O dono destrava sem fabricar conclusão de etapas que a ordem nunca
 * alcançou ("pra trás não faz") e com autoria real de quem forçou.
 *
 * IMPACTO SE REMOVIDO: o dono perde o mecanismo de contingência e as ordens
 * podem permanecer entulhadas no sistema por tempo indeterminado.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  /**
   * REGRA DE NEGÓCIO: puxa role (permissão) e nome (autoria) na mesma query.
   * O QUE: o nome é gravado na conclusão para registrar QUEM apertou o botão.
   * POR QUE: substitui o antigo "concluída pelo sistema" por autoria real.
   * IMPACTO SE REMOVIDO: perde-se a rastreabilidade de quem forçou a conclusão.
   */
  const [usuario] = await sql`
    SELECT role, nome
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

  // Nome de quem apertou o botão; cai no id só se o cadastro não tiver nome (blindagem).
  const responsavel = (usuario?.nome && String(usuario.nome).trim()) || user.id;
  const observacaoConclusao = `\n[CONCLUÍDA POR ${responsavel} em ${new Date().toISOString()}]`;
  const parecerConclusao = `Concluída por ${responsavel}`;

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
     * REGRA DE NEGÓCIO: descobrir ONDE a ordem está e concluir dali pra frente.
     *
     * O QUE: lê a timeline real (vw_timeline_ordem) e acha o passo mais avançado
     * que já teve progresso (concluído ou em andamento) = "passo atual". Só os
     * passos NESSE ponto ou à frente entram na conclusão; os anteriores ficam
     * intactos.
     * POR QUE: o botão não pode fabricar conclusão de etapas que a ordem nunca
     * alcançou (regra "pra trás não faz"), mesmo quando um passo do meio foi
     * pulado (ex.: auditoria de loja que não se aplica àquela ordem).
     * IMPACTO SE REMOVIDO: volta a marcar como concluídas etapas anteriores que
     * nunca aconteceram, sujando o histórico e disparando gatilhos indevidos.
     */
    const timeline = await tx`
      SELECT passo, evento_cod, status
      FROM alissonerp.vw_timeline_ordem
      WHERE ordem_id = ${ordemId}
      ORDER BY passo
    `;
    let maxProgresso = 1; // passo 1 (Criação da ordem) é sempre concluído
    for (const ev of timeline) {
      if (
        (ev.status === "concluido" || ev.status === "em_andamento") &&
        Number(ev.passo) > maxProgresso
      ) {
        maxProgresso = Number(ev.passo);
      }
    }
    // Códigos de evento que estão no passo atual ou à frente (>= maxProgresso).
    const paraFrente = new Set(
      timeline
        .filter((ev: any) => Number(ev.passo) >= maxProgresso)
        .map((ev: any) => ev.evento_cod as string),
    );
    const concluir = (cod: string): boolean => paraFrente.has(cod);

    // Só conta o que REALMENTE concluiu do passo atual pra frente.
    let auditoriaLojaRows: any[] = [];
    let protocoloIdaRows: any[] = [];
    let pcpRows: any[] = [];
    let auditoriaFabRows: any[] = [];
    let protocoloVoltaRows: any[] = [];
    let aprovacaoRows: any[] = [];
    let entregaRows: any[] = [];

    // Passo 2 — Auditoria de LOJA
    if (concluir("auditoria_loja")) {
      auditoriaLojaRows = await tx`
        UPDATE alissonerp.auditorias
        SET situacao = 'aprovado',
            parecer = COALESCE(NULLIF(parecer, ''), ${parecerConclusao}),
            data_conclusao = COALESCE(data_conclusao, now())
        WHERE ordem_id = ${ordemId}
          AND tipo_auditoria = 'loja'
          AND situacao IN ('pendente', 'em_analise', 'pendenciado')
        RETURNING id
      `;
    }

    // Passo 3 — Protocolo IDA
    if (concluir("protocolo_ida")) {
      protocoloIdaRows = await tx`
        UPDATE alissonerp.protocolos p
        SET etapas = 'concluido',
            updated_at = now()
        WHERE p.direcao = 'ida'
          AND p.etapas <> 'concluido'
          AND p.id IN (
            SELECT po.protocolo_id
            FROM alissonerp.protocolo_ordens po
            WHERE po.ordem_id = ${ordemId}
          )
        RETURNING id
      `;
    }

    // Passo 4 — PCP
    if (concluir("pcp")) {
      pcpRows = await tx`
        UPDATE alissonerp.pcp
        SET etapas = 'concluido',
            data_conclusao = COALESCE(data_conclusao, now()),
            updated_at = now()
        WHERE ordem_id = ${ordemId}
          AND etapas <> 'concluido'
        RETURNING id
      `;
    }

    // Passo 5 — Auditoria de FÁBRICA
    if (concluir("auditoria_fabrica")) {
      auditoriaFabRows = await tx`
        UPDATE alissonerp.auditorias
        SET situacao = 'aprovado',
            parecer = COALESCE(NULLIF(parecer, ''), ${parecerConclusao}),
            data_conclusao = COALESCE(data_conclusao, now())
        WHERE ordem_id = ${ordemId}
          AND tipo_auditoria = 'fabrica'
          AND situacao IN ('pendente', 'em_analise', 'pendenciado')
        RETURNING id
      `;
    }

    // Passo 6 — Protocolo VOLTA
    if (concluir("protocolo_volta")) {
      protocoloVoltaRows = await tx`
        UPDATE alissonerp.protocolos p
        SET etapas = 'concluido',
            updated_at = now()
        WHERE p.direcao = 'volta'
          AND p.etapas <> 'concluido'
          AND p.id IN (
            SELECT po.protocolo_id
            FROM alissonerp.protocolo_ordens po
            WHERE po.ordem_id = ${ordemId}
          )
        RETURNING id
      `;
    }

    // Passo 7 — Aprovação consultora
    if (concluir("aprovacao_consultora")) {
      aprovacaoRows = await tx`
        UPDATE alissonerp.aprovacoes_consultora
        SET etapas = 'aprovado'
        WHERE ordem_id = ${ordemId}
          AND etapas IN ('pendente', 'aguardando')
        RETURNING id
      `;
    }

    // Passo 8 — Preparação entrega
    if (concluir("preparacao_entrega")) {
      entregaRows = await tx`
        UPDATE alissonerp.preparacoes_entrega
        SET etapas = 'concluido',
            updated_at = now()
        WHERE ordem_id = ${ordemId}
          AND etapas <> 'concluido'
        RETURNING id
      `;
    }

    /**
     * REGRA DE NEGÓCIO: marca a ORDEM como concluída e registra o autor.
     * O QUE: status → concluido + carimbo "[CONCLUÍDA POR <nome> em <data>]".
     * POR QUE: tira a ordem do funil e deixa rastro de quem forçou a conclusão.
     * IMPACTO SE REMOVIDO: ordem continua entulhando o rastreio, sem autoria.
     */
    await tx`
      UPDATE alissonerp.ordens
      SET status = 'concluido',
          data_conclusao = COALESCE(data_conclusao, now()),
          detalhes_ordem = COALESCE(detalhes_ordem, '') || ${observacaoConclusao},
          updated_at = now()
      WHERE id = ${ordemId}
    `;

    /**
     * REGRA DE NEGÓCIO: sweep final do PCP para blindar o kanban de rota.
     *
     * O QUE: se o PCP está no passo atual ou à frente, reaplica a conclusão caso
     * uma atualização intermediária o tenha reativado por gatilho.
     * POR QUE: evita que a OF reapareça em "Novas Ordens" no PCP após a conclusão.
     * IMPACTO SE REMOVIDO: ordem concluída pode voltar a entulhar o PCP.
     * OBS: só roda quando o PCP é do passo atual pra frente — respeita "pra trás não faz".
     */
    let pcpSweepRows: any[] = [];
    if (concluir("pcp")) {
      pcpSweepRows = await tx`
        UPDATE alissonerp.pcp
        SET etapas = 'concluido',
            data_conclusao = COALESCE(data_conclusao, now()),
            updated_at = now()
        WHERE ordem_id = ${ordemId}
          AND etapas <> 'concluido'
        RETURNING id
      `;
    }

    /**
     * REGRA DE NEGÓCIO: conclusão forçada de REPOSIÇÃO garante ENTRADA no estoque.
     *
     * O QUE: se a ordem for de reposição (reposicao_venda/reposicao_loja), garante
     * a entrada da peça no estoque comercial (almox. 2) — idempotente.
     * POR QUE: dependendo de onde a ordem travou, o protocolo de volta pode NÃO
     * ter sido concluído por este botão; a entrada explícita garante que a peça
     * exista no estoque, senão a entrega da venda quebra com STOCK_NEGATIVE
     * (caso C-2372). fn_reposicao_entrada_estoque não dobra se a volta concluir.
     * IMPACTO SE REMOVIDO: reposição pode concluir sem peça no estoque → entrega travada.
     */
    const [entradaRepos] = await tx`
      SELECT alissonerp.fn_reposicao_entrada_estoque(${ordemId}, ${user.id}::uuid) AS criadas
    `;

    return {
      notFound: false,
      ordem_id: ordemId,
      passo_atual: maxProgresso,
      concluido_por: responsavel,
      auditorias_loja_concluidas: auditoriaLojaRows.length,
      protocolos_ida_concluidos: protocoloIdaRows.length,
      pcp_concluidos: pcpRows.length,
      pcp_concluidos_sweep_final: pcpSweepRows.length,
      auditorias_fabrica_concluidas: auditoriaFabRows.length,
      protocolos_volta_concluidos: protocoloVoltaRows.length,
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
