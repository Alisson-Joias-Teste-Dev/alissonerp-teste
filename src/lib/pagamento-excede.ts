/**
 * Tradutor do erro da TRAVA de pagamento (migration 333 — trigger
 * trg_pagamento_nao_exceder_total / fn_pagamento_nao_exceder_total).
 *
 * A REGRA "a soma das linhas de pagamento não pode passar do total da venda"
 * mora num ÚNICO lugar: o trigger no banco (cobre os 13 caminhos que inserem em
 * pagamentos_venda). Este módulo NÃO recalcula a regra — só reconhece o erro que
 * o banco levanta e devolve uma mensagem amigável (409) em vez de um 500 cru.
 *
 * Por que marcador na mensagem e não SQLSTATE: o banco já usa P0001 (RAISE
 * EXCEPTION padrão) em dezenas de funções; o prefixo estável 'PAGAMENTO_EXCEDE_
 * TOTAL' identifica este caso sem colidir com os outros.
 */

export const PAGAMENTO_EXCEDE_MARKER = "PAGAMENTO_EXCEDE_TOTAL";

export const PAGAMENTO_EXCEDE_MSG =
  "Pagamento já completo: as formas de pagamento já cobrem o total da venda. Remova uma linha antes de adicionar outra.";

/** True se o erro veio da trava do banco (soma de pagamentos > total da venda). */
export function isPagamentoExcedeError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
  return msg.includes(PAGAMENTO_EXCEDE_MARKER);
}
