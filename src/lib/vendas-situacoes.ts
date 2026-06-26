// ─────────────────────────────────────────────────────────────────────────────
// Situações de venda (vendas_erp.situacao) — FONTE ÚNICA pra "vendas que valeram".
//
// SITUACOES_VENDA_ATIVAS: vendas que aconteceram e CONTAM (comissão, análises).
// Inclui 'virou_credito' (reserva do crediário que estourou e virou vale-crédito):
// a consultora MANTÉM a comissão sobre o que foi pago. NÃO inclui 'rascunho' nem
// 'cancelado'. ('enviado'/'concluido' são históricos, mantidos por compatibilidade.)
//
// ⚠️ A view SQL `vw_dash_vendas_todas` (migration 328, base 304) tem a MESMA lista
// embutida no SQL — se mudar aqui, espelhe lá (SQL não importa TS). Ver
// docs/plano-status-virou-credito.md.
//
// Uso com postgres.js: `ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})`.
// ─────────────────────────────────────────────────────────────────────────────
export const SITUACOES_VENDA_ATIVAS: readonly string[] = [
  "aprovado",
  "em_rota",
  "enviado",
  "entregue",
  "concluido",
  "virou_credito",
];
