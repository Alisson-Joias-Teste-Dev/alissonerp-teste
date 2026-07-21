/**
 * frete-avulso-alerta.ts — regra do AVISO de valor alto no frete avulso.
 *
 * BLOCO 4 (jul/2026), P2 — decisão do Jonathan: NÃO existe teto que bloqueia
 * a aprovação do frete avulso — o aprovador sempre pode aprovar/rejeitar
 * independente do valor. O que muda é só um AVISO visual (destaque
 * vermelho) no valor pago ao MOTOBOY (não no valor cobrado do cliente)
 * quando ele passa do limite abaixo, pra o aprovador não decidir "às cegas".
 *
 * Extraído para um arquivo à parte (em vez de ficar só dentro do
 * TarefaDrawer.tsx) por dois motivos:
 *   1. Constante NOMEADA e comentada — não um número solto no JSX.
 *   2. Função pura testável sem precisar renderizar o componente React
 *      (ver src/__tests__/frete-avulso-alerta-limite.test.ts).
 *
 * IMPACTO SE ALTERADO: muda o ponto a partir do qual o aprovador é avisado;
 * NÃO afeta se a aprovação é possível (isso nunca foi bloqueado por valor).
 */

/** Acima deste valor (em reais), o frete do MOTOBOY aparece com alerta visual. */
export const LIMITE_ALERTA_FRETE_MOTOBOY = 200;

/**
 * Decide se o valor do frete do motoboy deve aparecer com destaque de alerta.
 * `null`/`undefined` (valor ainda não carregado ou entrega sem motoboy_id
 * lançado) nunca dispara alerta — não há valor pra avaliar.
 */
export function precisaAlertaFreteMotoboy(valor: number | null | undefined): boolean {
  return valor != null && valor > LIMITE_ALERTA_FRETE_MOTOBOY;
}
