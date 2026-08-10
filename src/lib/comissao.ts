export interface FaixaComissao {
  desconto_pct: number;
  comissao_pct: number;
}

/**
 * Comissão do vendedor por faixa de desconto concedido no item.
 * REGRA DE NEGÓCIO: acima de 30% de desconto a comissão cai pro piso (0,5%),
 * independente de faixa cadastrada — desconto grande demais não paga comissão cheia.
 * IMPACTO SE ALTERADO: muda o valor pago de comissão em toda venda com desconto.
 */
export function getComissao(pct: number, faixas: FaixaComissao[]): number {
  if (pct > 30) return 0.5;
  const faixa = faixas.find(f => f.desconto_pct === Math.round(pct));
  if (!faixa) return 0;
  return faixa.comissao_pct;
}
