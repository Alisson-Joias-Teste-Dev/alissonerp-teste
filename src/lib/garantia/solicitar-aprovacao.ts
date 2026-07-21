// ═══════════════════════════════════════════════════════════════════════════
// Garantia fora do prazo — cria o PEDIDO DE APROVAÇÃO (não cria a ordem).
//
// REGRA DE NEGÓCIO (Jonathan, 17/07 — docs/regras-negocio/ordens.md §3):
//   A tarefa autoriza "esta venda pode abrir garantia fora do prazo". A ORDEM só
//   nasce depois, quando a consultora abre a garantia de fato (POST /api/ordens),
//   que consome esta aprovação (uso único via tarefas.ordem_id).
//
//   POR QUÊ separar a aprovação da ordem: se a ordem nascesse antes, ela existiria
//   bloqueada esperando decisão — e todo lugar que lê `ordens` (Protocolo, PCP,
//   trigger trg_criar_servico_from_pcp, views) viraria um furo. Assim, nada existe
//   até aprovar. De quebra, a consultora não sobe foto/peso/vídeo antes de saber
//   se pode.
//
//   Aprovador: camada config-first (chave 'aprovadores_garantia_fora_prazo').
//   Config vazia = ninguém aprova (409), nem admin — política do projeto.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { criarNotificacao } from "@/lib/notificacoes";
import { resolverAprovadores } from "@/lib/aprovacoes";
import { avaliarGarantia } from "@/lib/garantia/prazo-garantia";

/** Tipo da tarefa. DEVE bater com o multiAprovadorCond (api/tarefas) e o eventoDaTarefa. */
export const GARANTIA_FORA_PRAZO_TIPO = "garantia_fora_prazo" as const;

export class GarantiaAprovacaoError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GarantiaAprovacaoError";
  }
}

/**
 * criarSolicitacaoGarantiaForaPrazo — abre (ou reaproveita) o pedido de aprovação
 * para abrir garantia fora do prazo de uma venda.
 *
 * IDEMPOTENTE por venda: se já houver pedido PENDENTE ou aprovação já concedida e
 * AINDA NÃO consumida (ordem_id IS NULL) para a mesma venda, devolve a existente
 * em vez de empilhar tarefas duplicadas.
 */
export async function criarSolicitacaoGarantiaForaPrazo(params: {
  vendaId: number;
  tiposServicoIds: number[];
  motivo?: string | null;
  user: { id: string; email?: string | null };
}): Promise<{ tarefa_id: number; ja_existia: boolean; status: "aguardando_aprovacao" | "aprovada" }> {
  const { vendaId, tiposServicoIds, motivo, user } = params;

  // 1. Confirma que ESTA garantia é mesmo caso de aprovação. Não abrir pedido para
  //    garantia dentro do prazo, vitalícia, ou de venda não entregue (essa é trava
  //    seca — não tem saída por aprovação, então nem cria tarefa).
  const aval = await avaliarGarantia(sql, vendaId, tiposServicoIds);
  if (aval.permitido) {
    throw new GarantiaAprovacaoError(
      422,
      "Esta garantia não precisa de aprovação — pode ser aberta normalmente.",
    );
  }
  if (aval.motivo === "venda_nao_entregue") {
    throw new GarantiaAprovacaoError(
      422,
      aval.mensagem ?? "Só é possível abrir garantia de pedido entregue. Não há aprovação para isso.",
    );
  }
  // A partir daqui: motivo === 'fora_do_prazo'.

  // 2. Já existe pedido em aberto ou aprovação não consumida para esta venda?
  //    COALESCE(tipo,'') — tipo é NULL em vários fluxos e NULL = 'x' não é TRUE
  //    (armadilha documentada em aprovacoes.md §5, já travou aprovações em prod).
  const [existente] = await sql`
    SELECT id, status
      FROM alissonerp.tarefas
     WHERE COALESCE(tipo, '') = ${GARANTIA_FORA_PRAZO_TIPO}
       AND venda_id = ${vendaId}
       AND ordem_id IS NULL
       AND status IN ('aguardando_aprovacao', 'aprovada')
     ORDER BY id DESC
     LIMIT 1
  `;
  if (existente) {
    return {
      tarefa_id: Number(existente.id),
      ja_existia: true,
      status: existente.status as "aguardando_aprovacao" | "aprovada",
    };
  }

  // 3. Quem aprova — camada config-first. Exclui o próprio solicitante da lista.
  const resolucao = await resolverAprovadores(GARANTIA_FORA_PRAZO_TIPO, { solicitanteId: user.id });
  if (resolucao.status === "nao_configurado") {
    throw new GarantiaAprovacaoError(
      409,
      "Nenhum aprovador de garantia fora do prazo configurado. Defina em Configurações › Aprovadores.",
    );
  }
  // responsavel_id = 1º da lista (quem RECEBE a notificação). Os demais enxergam a
  // tarefa pelo multiAprovadorCond (api/tarefas) — basta um decidir.
  const aprovadores = resolucao.aprovadores;
  const responsavelId = aprovadores[0];

  const [venda] = await sql`
    SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = ${vendaId} LIMIT 1
  `;
  const numeroVenda = venda?.numero_venda ?? String(vendaId);

  const descricao =
    `Pedido para abrir garantia da venda ${numeroVenda} fora do prazo de 7 dias úteis ` +
    `(entregue há ${aval.diasUteis} dias úteis).` +
    (motivo ? `\n\nMotivo: ${motivo}` : "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tarefaId = await sql.begin(async (tx: any) => {
    const [tarefa] = await tx`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo, venda_id)
      VALUES (
        ${`Aprovação: garantia fora do prazo — venda ${numeroVenda}`},
        ${descricao},
        ${responsavelId}::uuid,
        ${user.id}::uuid,
        'alta',
        'aguardando_aprovacao',
        ${tx.array(["aprovacao_garantia_fora_prazo"])},
        ${GARANTIA_FORA_PRAZO_TIPO},
        ${vendaId}
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${user.id}::uuid, ${responsavelId}::uuid, 'pendente')
    `;

    return Number(tarefa.id);
  });

  await criarNotificacao({
    usuarioId: responsavelId,
    tipo: "aprovacao",
    titulo: `Aprovação solicitada — garantia fora do prazo (venda ${numeroVenda})`,
    mensagem: descricao,
    remetenteId: user.id,
    link: `/tarefas?abrir=${tarefaId}`,
  }).catch(() => {});

  return { tarefa_id: tarefaId, ja_existia: false, status: "aguardando_aprovacao" };
}
