// REGRA DE NEGOCIO — A UNIDADE DA PEDRA NO ESTOQUE:
// - O que faz: converte o saldo de pedra do razao de estoque (que esta em GRAMAS) para quilates.
// - Por que existe este arquivo: o fator 0.2 estava solto e repetido pelo codigo, e foi exatamente
//   isso que permitiu a trava do apontamento comparar grama contra quilate sem ninguem notar
//   (PCP #1130 / PD1019, 11/08/2026). Unidade de pedra mora aqui, num lugar so.
// - Impacto se alterado/removido: o saldo de pedra volta a ser lido em unidades diferentes por cada
//   tela, e o apontamento recusa (ou libera) estoque errado por um fator de 5.
//
// NAO e o arquivo de COMPRA de pedra (`compras-pedras.ts`). Aqui e sobre a unidade do ESTOQUE.
// A pedra entra no estoque pela tela de Lancamento Avulso > Entrada Avulsa, NAO por compra
// (confirmado pelo Jonathan em 11/08/2026) — e essa tela grava o peso em GRAMAS.

// 1 ct = 0,2 g.
export const GRAMAS_POR_CT = 0.2;

/**
 * REGRA DE NEGOCIO:
 * - O que faz: converte o saldo de pedra da vw_saldo_estoque (em GRAMAS) para quilates.
 * - Por que GRAMA e a unidade do razao: a pedra so entra no estoque pela Entrada Avulsa, que grava
 *   o peso em grama; e as duas outras leituras da MESMA coluna tambem a tratam como grama —
 *   esta funcao existe para espelhar exatamente as duas:
 *     - migration 122 (a mais nova a definir a view):
 *         ROUND((SUM(entrada) - SUM(saida)) / 0.2, 4) AS saldo_ct
 *     - EstoqueClient.tsx:394:
 *         formatPesoCt(Number(s.total_entrada) / 0.2)
 * - Por que arredondar em 4 casas: para bater com o ROUND(..., 4) da view. Sem isso,
 *   0.414 / 0.2 da 2.0699999999999998 em ponto flutuante e um saldo EXATAMENTE igual ao pedido
 *   (2.0700 ct) seria recusado como insuficiente — o defeito real do PCP #1130 / PD1019.
 * - Impacto se alterado/removido: trava do apontamento e tela de Estoque voltam a divergir.
 */
export function saldoGramasParaCt(saldoGramas: number | null | undefined): number {
  const g = Number(saldoGramas ?? 0);
  if (!Number.isFinite(g)) return 0;
  return Number((g / GRAMAS_POR_CT).toFixed(4));
}
