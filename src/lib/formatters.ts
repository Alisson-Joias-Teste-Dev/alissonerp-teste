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

/**
 * Formata DATE (sem horário) como DD/MM/YYYY sem conversão de timezone.
 * Colunas DATE do Postgres voltam como "2026-04-22" ou "2026-04-22T00:00:00.000Z".
 * Usar `new Date(...).toLocaleDateString` desloca para UTC-3 e volta um dia atrás.
 * Aqui fatiamos os 10 primeiros chars e reorganizamos.
 */
export function formatDateBR(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const s = typeof iso === 'string' ? iso : iso.toISOString();
  const [y, m, d] = s.slice(0, 10).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

/**
 * Remove tudo que não for dígito. Útil para normalizar CPF/CNPJ/telefone/CEP
 * antes de comparar com valores armazenados sem máscara no banco (intencional).
 */
export function onlyDigits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D+/g, '');
}

/**
 * Mascara CPF (11 dígitos) ou CNPJ (14 dígitos) para exibição.
 * Banco armazena SEM máscara — a máscara é puramente de apresentação.
 * Ex: "12345678900"   → "123.456.789-00"
 *     "12345678000199" → "12.345.678/0001-99"
 * Para quantidades diferentes de dígitos, devolve o valor original.
 */
export function maskCpfCnpj(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = onlyDigits(raw);
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return raw;
}

/**
 * Máscara de celular (BR) para EXIBIÇÃO/INPUT — formata progressivamente enquanto
 * digita. O banco guarda só os dígitos (use onlyDigits ao salvar); a máscara é
 * puramente visual e NÃO deve ir pro banco — o envio do WhatsApp (Evolution)
 * normaliza a partir dos dígitos, então máscara salva quebraria a consistência.
 * Ex: "85999567025" → "(85) 99956-7025" | "8599567025" → "(85) 9956-7025"
 */
export function maskCelular(raw: string | null | undefined): string {
  const d = onlyDigits(raw).slice(0, 11); // DDD (2) + até 9 dígitos
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
