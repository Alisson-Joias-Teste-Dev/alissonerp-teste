/**
 * REGRA DE NEGÓCIO: status centralizados do cofre_ouro_baixas.
 *
 * O QUE: define os status válidos, rótulos (label), cores e transições permitidas.
 * POR QUE: evita duplicação de regra em múltiplos arquivos (frontend/API/histórico).
 *   Qualquer alteração de status, label ou transição deve ser feita SOMENTE aqui.
 * IMPACTO SE REMOVIDO/ALTERADO: múltiplos pontos do sistema quebram — a baixa de ouro,
 *   protocolo de sangria, limpeza e aprovação usam este módulo como fonte única.
 */

export const STATUS_BAIXA_OURO = {
  ESPERANDO_PROTOCOLO: "esperando_protocolo",
  EM_TRAFEGO: "em_trafego",
  RECEBIDO: "recebido",
  EM_LIMPEZA: "em_limpeza",
  AGUARDANDO_APROVACAO: "aguardando_aprovacao",
  CONCLUIDO: "concluido",
  CANCELADO: "cancelado",
} as const;

export const STATUS_LABEL: Record<string, string> = {
  esperando_protocolo: "Esperando Protocolo",
  em_trafego: "Em Tráfego",
  recebido: "Recebido",
  em_limpeza: "Em Limpeza",
  aguardando_aprovacao: "Aguardando Aprovação",
  concluido: "Concluído",
  cancelado: "Cancelado",
  pendente: "Pendente", // compatibilidade com registros antigos
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  esperando_protocolo: { bg: "#FEF3C7", text: "#92400E" },
  em_trafego: { bg: "#DBEAFE", text: "#1E40AF" },
  recebido: { bg: "#EDE9FE", text: "#7C3AED" },
  em_limpeza: { bg: "#FCE7F3", text: "#BE185D" },
  aguardando_aprovacao: { bg: "#FEF3C7", text: "#92400E" },
  concluido: { bg: "#D1FAE5", text: "#065F46" },
  cancelado: { bg: "#FEE2E2", text: "#991B1B" },
  pendente: { bg: "#FEF3C7", text: "#92400E" },
};

/**
 * REGRA DE NEGÓCIO: transições válidas entre status.
 *
 * O QUE: mapa que define quais status podem transitar para quais status seguintes.
 * POR QUE: impede "pulo" de etapas (ex.: aprovar sem limpar) e centraliza
 *   a validação em um único ponto reutilizado por frontend e API.
 * IMPACTO SE ALTERADO: qualquer endpoint que use validarTransicao() deve ser revisado.
 */
export const TRANSICOES_VALIDAS: Record<string, string[]> = {
  esperando_protocolo: ["em_trafego", "cancelado"],
  em_trafego: ["recebido", "cancelado"],
  recebido: ["em_limpeza"],
  em_limpeza: ["aguardando_aprovacao", "em_limpeza"],
  aguardando_aprovacao: ["concluido", "em_limpeza"],
  concluido: [],
  cancelado: [],
};

/**
 * Valida se a transição de status é permitida.
 * Reutilizado em API (baixas, protocolo) e opcionalmente no frontend
 * para bloquear ações inválidas.
 */
export function validarTransicao(atual: string, nova: string): boolean {
  const permitidas = TRANSICOES_VALIDAS[atual];
  if (!permitidas) return false;
  return permitidas.includes(nova);
}
