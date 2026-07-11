/**
 * REGRA DE NEGÓCIO: registra em audit_log toda decisão tomada via OVERRIDE do
 * admin (ACESSO_PLENO decidindo no lugar do aprovador designado).
 * O QUÊ: reusa a infra de auditoria existente (src/lib/audit) — nenhuma tabela nova.
 * POR QUÊ: rastreabilidade de quem decidiu fora do fluxo normal, no mesmo espírito
 *   da assinatura de mudanças de banco (CLAUDE.md §"Assinatura de Mudanças no
 *   Banco") aplicado agora a decisões de aprovação.
 * IMPACTO: `logAudit.operacao` só aceita INSERT/UPDATE/DELETE (audit.ts, fora do
 *   escopo desta fase — não foi alterado). A marca "APROVACAO_OVERRIDE" pedida no
 *   pacote da Fase 1 vai em `dados_depois.tipo_operacao` em vez do campo `operacao`.
 *   Reportado ao Jonathan/Opus: avaliar na Fase 5 se vale estender o union de audit.ts.
 */
import sql from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { EventoAprovacao, UsuarioAprovacao } from "./tipos";

export interface AlvoOverride {
  /** Aprovador que deveria ter decidido (resolvido por resolverAprovador). */
  aprovadorDesignadoId?: string | null;
  /** Id do registro-alvo da decisão (ex.: tarefa_id, venda_id) — usado como registro_id do audit_log. */
  registroId?: string | number;
}

export async function registrarOverride(
  user: UsuarioAprovacao,
  evento: EventoAprovacao,
  alvo: AlvoOverride,
  tx?: Parameters<typeof logAudit>[0],
): Promise<void> {
  await logAudit(tx ?? sql, {
    tabela: "aprovacoes_override",
    operacao: "INSERT",
    registro_id: alvo.registroId ?? `${evento}:${user.id}`,
    usuario_id: user.id,
    dados_depois: {
      tipo_operacao: "APROVACAO_OVERRIDE",
      evento,
      decisor_role: user.role,
      aprovador_designado_id: alvo.aprovadorDesignadoId ?? null,
    },
  });
}
