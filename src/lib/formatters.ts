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
