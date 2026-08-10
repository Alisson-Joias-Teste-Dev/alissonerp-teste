// ─────────────────────────────────────────────────────────────────────────────
// Situações de venda (vendas_erp.situacao) — FONTE ÚNICA pra "vendas que valeram".
//
// SITUACOES_VENDA_ATIVAS: vendas que aconteceram e CONTAM (comissão, análises).
// Inclui 'virou_credito' (reserva do crediário que estourou e virou vale-crédito):
// a consultora MANTÉM a comissão sobre o que foi pago. NÃO inclui 'rascunho' nem
// 'cancelado'. ('concluido' é histórico, mantido por compatibilidade.)
//
// ⚠️ 'enviado' foi removido desta lista (fase 3.2 da migração fechou
// vendas_erp.status num enum estrito, e 'enviado' nunca chegou a ser um valor
// válido — 0 linhas reais com esse status). A view SQL `vw_dash_vendas_todas`
// ainda cita 'enviado', mas lá a comparação é sempre com ::text explícito, então
// não quebra; aqui o valor entra num `= ANY(array)` comparado direto contra a
// coluna enum, e um valor fora do enum faz o Postgres rejeitar a query inteira.
//
// ⚠️ A view SQL `vw_dash_vendas_todas` (migration 328, base 304) tem uma lista
// parecida embutida no SQL — se mudar aqui, espelhe lá (SQL não importa TS). Ver
// docs/plano-status-virou-credito.md.
//
// Uso com postgres.js: `ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})`.
// ─────────────────────────────────────────────────────────────────────────────
export const SITUACOES_VENDA_ATIVAS: readonly string[] = [
  "aprovado",
  "em_rota",
  "entregue",
  "concluido",
  "virou_credito",
];
