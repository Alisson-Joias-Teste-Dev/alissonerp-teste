/**
 * Formata peso de ouro/metal com exatamente 2 casas decimais.
 * Retorna '—' para valores nulos/inválidos.
 * Uso: {formatPeso(valor)}g
 */
export function formatPeso(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const num = typeof valor === "string" ? parseFloat(valor.replace(",", ".")) : valor;
  if (isNaN(num)) return "—";
  return num.toFixed(2);
}

/**
 * Formata peso em quilates (ct) — 4 casas decimais
 * Ex: 2.5 → "2.5000 ct" | null → "—"
 */
export function formatPesoCt(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  if (isNaN(num)) return '—';
  return `${num.toFixed(4)} ct`;
}

/**
 * Converte gramas para quilates
 * 1 ct = 0.2g → ct = g / 0.2
 */
export function gramasToCt(gramas: number): number {
  return parseFloat((gramas / 0.2).toFixed(4));
}

/**
 * Converte quilates para gramas
 * 1 ct = 0.2g → g = ct × 0.2
 */
export function ctToGramas(ct: number): number {
  return parseFloat((ct * 0.2).toFixed(4));
}

/**
 * Formata valor monetário em reais (pt-BR)
 * Ex: 1234.5 → "R$ 1.234,50"
 */
export function formatMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return 'R$ 0,00';
  const num = typeof valor === 'string' ? parseFloat(valor) : valor;
  if (isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
