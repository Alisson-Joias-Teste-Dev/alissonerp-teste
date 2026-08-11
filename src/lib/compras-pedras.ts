// REGRA DE NEGOCIO:
// - O que faz: centraliza calculos de compra de pedras (custo por ct e quantidade estimada de pecas).
// - Por que: evita duplicidade de regra entre front, API e outros fluxos de compra.
// - Impacto se alterado/removido: cada tela pode calcular diferente, gerando divergencia operacional e financeira.

// 1 ct = 0,2 g. Constante nomeada porque o 0.2 solto espalhado pelo codigo foi
// justamente o que permitiu comparar grama contra quilate sem ninguem notar.
export const GRAMAS_POR_CT = 0.2;

/**
 * REGRA DE NEGOCIO:
 * - O que faz: converte o saldo de pedra da vw_saldo_estoque (que vem em GRAMAS) para quilates.
 * - Por que: `movimentacoes_estoque` guarda o peso de pedra em grama, e quem le esse saldo deriva
 *   o ct dividindo por 0,2 — e a trava de saldo do apontamento precisa ler igual a todos os outros.
 *   As duas outras leituras da MESMA coluna, que esta funcao passa a espelhar:
 *     - migration 122 (a mais nova a definir a view): ROUND((SUM(entrada) - SUM(saida)) / 0.2, 4) AS saldo_ct
 *     - EstoqueClient.tsx:394: formatPesoCt(Number(s.total_entrada) / 0.2)
 * - Por que arredondar em 4 casas: para bater exatamente com o ROUND(..., 4) da view. Sem isso,
 *   0.414 / 0.2 da 2.0699999999999998 em ponto flutuante e um saldo EXATAMENTE igual ao pedido
 *   (2.0700 ct) seria recusado como insuficiente — o defeito real do PCP #1130 / PD1019.
 * - Impacto se alterado/removido: a trava volta a comparar unidades diferentes e recusa (ou libera)
 *   apontamento de pedra com o estoque errado por um fator de 5.
 */
export function saldoGramasParaCt(saldoGramas: number | null | undefined): number {
  const g = Number(saldoGramas ?? 0);
  if (!Number.isFinite(g)) return 0;
  return Number((g / GRAMAS_POR_CT).toFixed(4));
}

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

// Pedra solta e nomeada comecando pelo nome da pedra ("Diamante Natural 1.0mm", "Pedra safira");
// joia comeca pelo tipo ("Brinco...", "Anel..."). Validado no banco: zero joias comecam com esses prefixos.
const PREFIXOS_NOME_PEDRA = ["diamante", "zirc", "rubi", "esmeralda", "safira", "pedra", "moissanita", "mossainite"];

/**
 * REGRA DE NEGOCIO:
 * - O que faz: classifica se um produto e PEDRA SOLTA (materia-prima comprada em ct) ou joia/produto acabado.
 * - Por que: a compra comercial tem dois fluxos distintos (pedra = ct total + custo total; joia = qtd inteira + valor/g)
 *   e a classificacao estava duplicada e errada em 4 lugares (API e front), tratando joia com pedra como pedra solta.
 * - Criterios validados no banco (211 pedras soltas, zero falso positivo):
 *     1. categoria comeca com "Pedras"
 *     2. existe registro em alissonerp.produto_pedra_extras (pedras sem categoria cadastrada)
 *     3. nome COMECA com nome de pedra (pedras orfas sem categoria e fora da tabela de extras)
 * - NUNCA usar `tem_pedra_preciosa` (significa joia COM pedra — 1.217 joias tem a flag) nem
 *   `categoria_precificacao` (valores reais sao "Leves 1-5"/"Atacado", nunca "Pedras") para classificar.
 * - NUNCA usar `includes` no nome: "Brinco com Esmeralda e Diamantes" (AJ5079) viraria pedra — esse era o bug.
 * - Impacto se alterado/removido: joias com pedra voltam a cair no fluxo de compra de pedra (qtd/peso/custo errados).
 */
export function ehPedraSolta(p: {
  categoria?: string | null;
  nome?: string | null;
  tem_registro_pedra_extras?: boolean | null;
}): boolean {
  const categoria = String(p.categoria ?? "").toLowerCase().trim();
  const nome = String(p.nome ?? "").toLowerCase().trim();
  return (
    categoria.startsWith("pedras") ||
    Boolean(p.tem_registro_pedra_extras) ||
    PREFIXOS_NOME_PEDRA.some((prefixo) => nome.startsWith(prefixo))
  );
}
