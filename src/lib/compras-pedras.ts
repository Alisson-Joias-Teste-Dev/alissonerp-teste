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
