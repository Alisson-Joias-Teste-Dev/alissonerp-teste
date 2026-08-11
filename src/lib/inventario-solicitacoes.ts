import sql from "@/lib/db";
import { criarNotificacao } from "@/lib/notificacoes";
import {
  executarAbrirInventario,
  executarCancelarInventario,
  executarConcluirInventario,
  InventarioAcaoError,
} from "@/lib/inventario-acoes";

/**
 * REGRA DE NEGÓCIO — SOLICITAÇÕES DO INVENTÁRIO (v2.83.0):
 * - O que faz: transforma ações do inventário (abrir/concluir/cancelar)
 *   pedidas pela role `operador_inventario` em PEDIDOS DE APROVAÇÃO —
 *   mesma engrenagem de tarefas usada por compra comercial e desconto.
 *   A ação só EXECUTA quando o administrador aprova a tarefa.
 * - Por quê: regra do Jonathan — Ytalo/Geovana veem tudo do estoque e
 *   contam via leitor RFID, mas não editam nada direto.
 * - Impacto se alterado/removido: operador volta a agir direto (sem
 *   governança) ou fica 100% travado (sem canal de pedido).
 *
 * Aprovador: configuracoes_unificado chave 'aprovador_inventario' (UUID do
 * usuário — o Jonathan). Sem config → pedido é recusado com orientação.
 */

export type TipoAcaoInventario = "abrir" | "concluir" | "cancelar";

const TITULO_ACAO: Record<TipoAcaoInventario, string> = {
  abrir: "Abrir inventário",
  concluir: "Concluir inventário",
  cancelar: "Cancelar inventário",
};

export async function criarSolicitacaoInventario(params: {
  tipoAcao: TipoAcaoInventario;
  inventarioId?: number | null;
  payload: Record<string, unknown>;
  resumo: string; // descrição legível do pedido para o aprovador
  user: { id: string; email?: string | null };
}): Promise<{ solicitacao_id: number; tarefa_id: number }> {
  const { tipoAcao, inventarioId, payload, resumo, user } = params;

  // Aprovador vem SÓ da configuração central (governança — igual compra comercial)
  const [cfg] = await sql`
    SELECT valor FROM alissonerp.configuracoes_unificado
    WHERE chave = 'aprovador_inventario'
    LIMIT 1
  `;
  const aprovadorId = String(cfg?.valor ?? "").replace(/"/g, "").trim();
  if (!aprovadorId) {
    throw new InventarioAcaoError(
      "Nenhum aprovador de inventário configurado (configuracoes_unificado.aprovador_inventario)", 409,
    );
  }
  const [aprovador] = await sql`
    SELECT id FROM alissonerp.usuarios
    WHERE id = ${aprovadorId}::uuid AND ativo = true
    LIMIT 1
  `;
  if (!aprovador) {
    throw new InventarioAcaoError("Aprovador de inventário inválido ou inativo", 409);
  }

  // Evita fila dupla: mesmo pedido pendente para o mesmo alvo
  const [pendente] = await sql`
    SELECT id FROM alissonerp.solicitacoes_inventario
    WHERE tipo_acao = ${tipoAcao}
      AND status = 'pendente'
      AND inventario_id IS NOT DISTINCT FROM ${inventarioId ?? null}
    LIMIT 1
  `;
  if (pendente) {
    throw new InventarioAcaoError(
      `Já existe um pedido pendente de "${TITULO_ACAO[tipoAcao]}" aguardando aprovação (#${pendente.id})`, 409,
    );
  }

  const alvo = inventarioId ? ` #${inventarioId}` : "";
  const resultado = await sql.begin(async (tx: any) => {
    const [solic] = await tx`
      INSERT INTO alissonerp.solicitacoes_inventario
        (tipo_acao, inventario_id, payload, solicitante_id)
      VALUES
        (${tipoAcao}, ${inventarioId ?? null}, ${JSON.stringify(payload)}::jsonb, ${user.id}::uuid)
      RETURNING id
    `;

    const [tarefa] = await tx`
      INSERT INTO alissonerp.tarefas
        (titulo, descricao, responsavel_id, criado_por, prioridade, status, tags, tipo)
      VALUES (
        ${`Aprovação: ${TITULO_ACAO[tipoAcao]}${alvo}`},
        ${resumo},
        ${aprovadorId}::uuid,
        ${user.id}::uuid,
        'alta',
        'aguardando_aprovacao',
        ${tx.array(["aprovacao_inventario", `solicitacao_inventario:${solic.id}`])},
        'inventario_solicitacao'
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO alissonerp.aprovacoes_tarefa (tarefa_id, solicitante_id, aprovador_id, status)
      VALUES (${tarefa.id}, ${user.id}::uuid, ${aprovadorId}::uuid, 'pendente')
    `;

    await tx`
      UPDATE alissonerp.solicitacoes_inventario
      SET tarefa_id = ${tarefa.id}
      WHERE id = ${solic.id}
    `;

    return { solicitacao_id: solic.id, tarefa_id: tarefa.id };
  });

  await criarNotificacao({
    usuarioId: aprovadorId,
    tipo: "aprovacao",
    titulo: `Aprovação solicitada — ${TITULO_ACAO[tipoAcao]}${alvo}`,
    mensagem: `Pedido do operador de inventário aguardando sua aprovação.`,
    remetenteId: user.id,
    link: `/tarefas?abrir=${resultado.tarefa_id}`,
  }).catch(() => {});

  return resultado;
}

/**
 * Executa (ou rejeita) a solicitação quando o aprovador decide a tarefa.
 * Chamado pelo PATCH /api/tarefas/[id]/aprovacao no tipo 'inventario_solicitacao'.
 * Falha na execução NÃO desfaz a decisão — fica em status 'erro' com a
 * mensagem, para o admin agir (nunca perde o registro do pedido).
 */
export async function processarAprovacaoInventario(
  tarefaId: number,
  decisao: "aprovado" | "rejeitado",
  aprovadorId: string,
  motivo?: string,
) {
  const [solic] = await sql`
    SELECT id, tipo_acao, inventario_id, payload, status, solicitante_id
    FROM alissonerp.solicitacoes_inventario
    WHERE tarefa_id = ${tarefaId}
    LIMIT 1
  `;
  if (!solic) return { ok: false, motivo: "solicitacao_nao_encontrada" };
  if (solic.status !== "pendente") {
    return { ok: false, motivo: `solicitacao_ja_${solic.status}` };
  }

  if (decisao === "rejeitado") {
    await sql`
      UPDATE alissonerp.solicitacoes_inventario
      SET status = 'rejeitada', decidido_por = ${aprovadorId}::uuid, decidido_em = now(),
          erro_execucao = ${motivo ?? null}
      WHERE id = ${solic.id}
    `;
    await notificarSolicitante(solic.solicitante_id, aprovadorId, solic.tipo_acao, false, motivo);
    return { ok: true, decisao: "rejeitado" };
  }

  const payload = (solic.payload ?? {}) as Record<string, unknown>;
  try {
    let resultado: unknown;
    if (solic.tipo_acao === "abrir") {
      resultado = await executarAbrirInventario({
        local_estoque_id: Number(payload.local_estoque_id),
        obs: (payload.obs as string) ?? null,
        categoria: (payload.categoria as string) ?? null,
        userId: aprovadorId,
      });
    } else if (solic.tipo_acao === "concluir") {
      // Aprovador já viu no resumo os itens sem contagem/pendências — a
      // aprovação É a confirmação explícita (forcar).
      resultado = await executarConcluirInventario({
        invId: Number(solic.inventario_id),
        forcar: true,
        userId: aprovadorId,
      });
    } else if (solic.tipo_acao === "cancelar") {
      resultado = await executarCancelarInventario({
        invId: Number(solic.inventario_id),
        motivo: String(payload.motivo ?? "Aprovado via solicitação"),
        userId: aprovadorId,
      });
    }

    await sql`
      UPDATE alissonerp.solicitacoes_inventario
      SET status = 'executada', decidido_por = ${aprovadorId}::uuid, decidido_em = now()
      WHERE id = ${solic.id}
    `;
    await notificarSolicitante(solic.solicitante_id, aprovadorId, solic.tipo_acao, true);
    return { ok: true, decisao: "aprovado", resultado };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido na execução";
    await sql`
      UPDATE alissonerp.solicitacoes_inventario
      SET status = 'erro', decidido_por = ${aprovadorId}::uuid, decidido_em = now(),
          erro_execucao = ${msg}
      WHERE id = ${solic.id}
    `;
    return { ok: false, motivo: "erro_execucao", erro: msg };
  }
}

async function notificarSolicitante(
  solicitanteId: string | null,
  aprovadorId: string,
  tipoAcao: string,
  aprovado: boolean,
  motivo?: string,
) {
  if (!solicitanteId) return;
  await criarNotificacao({
    usuarioId: String(solicitanteId),
    tipo: "aprovacao",
    titulo: aprovado
      ? `Pedido aprovado — ${TITULO_ACAO[tipoAcao as TipoAcaoInventario] ?? tipoAcao}`
      : `Pedido rejeitado — ${TITULO_ACAO[tipoAcao as TipoAcaoInventario] ?? tipoAcao}`,
    mensagem: aprovado
      ? "Seu pedido foi aprovado e executado."
      : `Seu pedido foi rejeitado.${motivo ? ` Motivo: ${motivo}` : ""}`,
    remetenteId: aprovadorId,
  }).catch(() => {});
}
