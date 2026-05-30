// REGRA DE NEGOCIO:
// - O que faz: centraliza calculos de compra de pedras (custo por ct e quantidade estimada de pecas).
// - Por que: evita duplicidade de regra entre front, API e outros fluxos de compra.
// - Impacto se alterado/removido: cada tela pode calcular diferente, gerando divergencia operacional e financeira.

/**
 * REGRA DE NEGOCIO:
 * - O que faz: calcula custo por ct a partir de ct total e custo total da compra de pedra.
 * - Por que: o operador informa o valor fechado do lote; custo/ct deve ser derivado de forma padronizada.
 * - Impacto se alterado/removido: valor unitario por ct pode variar entre fluxos e distorcer custo final.
 */
export function calcularCustoPorCtPedra(pesoCt: number | null | undefined, custoTotal: number | null | undefined): number | null {
  const peso = Number(pesoCt ?? 0);
  const custo = Number(custoTotal ?? 0);
  if (!Number.isFinite(peso) || peso <= 0 || !Number.isFinite(custo) || custo <= 0) return null;
  return Number((custo / peso).toFixed(4));
}

/**
 * REGRA DE NEGOCIO:
 * - O que faz: estima quantidade de pecas de pedra usando ct total e peso padrao em ct por peca.
 * - Por que: pedras pequenas nao sao contadas manualmente com confiabilidade; a estimativa precisa ser automatica.
 * - Impacto se alterado/removido: operacao volta a depender de contagem manual imprecisa e perde consistencia.
 */
export function calcularQtdPecasPedra(
  pesoCtTotal: number | null | undefined,
  pesoPadraoCtPorPeca: number | null | undefined,
): { qtdExata: number; qtdEstimada: number } | null {
  const ctTotal = Number(pesoCtTotal ?? 0);
  const ctPorPeca = Number(pesoPadraoCtPorPeca ?? 0);
  if (!Number.isFinite(ctTotal) || ctTotal <= 0 || !Number.isFinite(ctPorPeca) || ctPorPeca <= 0) return null;

  const qtdExata = Number((ctTotal / ctPorPeca).toFixed(4));
  const qtdEstimada = Math.max(Math.round(qtdExata), 1);
  return { qtdExata, qtdEstimada };
}
