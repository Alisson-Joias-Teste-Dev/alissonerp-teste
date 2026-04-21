/**
 * Helpers compartilhados para preenchimento automático de markup baseado
 * no peso do produto + curva de precificação cadastrada.
 *
 * Usado em:
 *   • CadastroProdutoModal (auto-preenche quando usuário digita peso)
 *   • ProdutoDrawer (auto-preenche quando usuário altera peso)
 */

export interface Categoria {
  id: number;
  nome: string;
  faixa: string;
  curvePoints?: Array<{ markup: number }> | { markup: number } | null;
}

/**
 * Extrai os limites min/max da string "faixa" da categoria.
 * Aceita formatos "0.1 - 0.5", "0.1g - 0.5g", "0,1 g até 0,5 g", etc.
 */
export function parseFaixaPeso(faixa: string): { min: number; max: number } | null {
  const match = faixa.match(/([\d.,]+)\s*g?\s*[-–até]+\s*([\d.,]+)/i);
  if (!match) return null;
  const parseN = (s: string) => parseFloat(s.replace(",", "."));
  return { min: parseN(match[1]), max: parseN(match[2]) };
}

/**
 * Extrai o markup do primeiro ponto da curva de precificação.
 * Fallback 3.0 se não houver curva cadastrada.
 */
export function extrairMarkupDaCategoria(cat: Categoria): number {
  const cp = cat.curvePoints;
  if (!cp) return 3.0;
  if (Array.isArray(cp) && cp.length > 0 && cp[0].markup != null) return Number(cp[0].markup);
  if (typeof cp === "object" && !Array.isArray(cp) && "markup" in cp) {
    return Number((cp as { markup: number }).markup);
  }
  return 3.0;
}

/**
 * Busca a categoria correspondente a um peso (em gramas).
 * Retorna null se o peso não cai em nenhuma faixa cadastrada.
 */
export function buscarCategoriaPorPeso(peso: number, cats: Categoria[]): Categoria | null {
  for (const c of cats) {
    const f = parseFaixaPeso(c.faixa);
    if (f && peso >= f.min && peso <= f.max) return c;
  }
  return null;
}

/**
 * Descobre markup automático para um dado peso.
 * Retorna `null` se nenhuma categoria cadastrada cobre esse peso.
 */
export function markupAutomaticoPorPeso(
  peso: number,
  cats: Categoria[],
): { markup: number; categoria: Categoria } | null {
  if (!peso || peso <= 0 || !cats || cats.length === 0) return null;
  const cat = buscarCategoriaPorPeso(peso, cats);
  if (!cat) return null;
  return { markup: extrairMarkupDaCategoria(cat), categoria: cat };
}
