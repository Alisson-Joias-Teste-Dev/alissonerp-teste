// =====================================================================
// Utilities do Dashboard Comercial
// =====================================================================

import type { DashComissaoFaixa, DashVenda, DashParcelaPedido } from "@/lib/types/dashboard-comercial";

/**
 * Status de venda considerado concluído.
 * Fonte: public.vendas.status = 2 (98% dos registros)
 */
export const VENDA_STATUS_CONCLUIDO = 2;

/**
 * Formata Date para string YYYY-MM-DD (formato esperado pela API/banco).
 */
export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Retorna início do mês atual em YYYY-MM-DD.
 */
export function getStartOfMonth(ref?: Date): string {
  const d = ref ?? new Date();
  return formatDateISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Retorna fim do mês atual em YYYY-MM-DD.
 */
export function getEndOfMonth(ref?: Date): string {
  const d = ref ?? new Date();
  return formatDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * Retorna hoje em YYYY-MM-DD.
 */
export function getToday(): string {
  return formatDateISO(new Date());
}

/**
 * Retorna o mesmo range do ano anterior (para comparativo).
 */
export function getPreviousYearRange(from: string, to: string): { from: string; to: string } {
  const dFrom = new Date(from + "T00:00:00");
  const dTo = new Date(to + "T00:00:00");
  dFrom.setFullYear(dFrom.getFullYear() - 1);
  dTo.setFullYear(dTo.getFullYear() - 1);
  return { from: formatDateISO(dFrom), to: formatDateISO(dTo) };
}

/**
 * Calcula o valor de vale-troca somado para uma venda.
 * Recebe as parcelas da venda (via id_api_tiny → pedido_id_api).
 */
export function calcularValorValeTroca(parcelas: DashParcelaPedido[]): number {
  return parcelas
    .filter((p) => p.forma_pagamento === "Vale-troca")
    .reduce((acc, p) => acc + (p.valor ?? 0), 0);
}

/**
 * Total líquido da venda = total_venda - vale_troca usado.
 * Vale-troca é crédito do cliente, não é faturamento novo.
 */
export function calculateVendaTotal(venda: DashVenda, valorValeTroca: number): number {
  return (venda.total_venda ?? 0) - valorValeTroca;
}

/**
 * Calcula comissão percentual baseada em tabela de faixas.
 * Faixas: [{desconto_ate: 0, comissao: 4}, {desconto_ate: 1, comissao: 3.88}, ...]
 * Retorna comissão da faixa cujo desconto_ate é >= ao desconto real.
 *
 * NOTA: O parâmetro recebido deve ser o DESCONTO PERCENTUAL (não o valor).
 */
export function calcularComissaoPorTabela(
  descontoPercentual: number,
  tabela: DashComissaoFaixa[],
): number {
  if (!tabela || tabela.length === 0) return 0;
  const sorted = [...tabela].sort((a, b) => a.desconto_ate - b.desconto_ate);
  for (const faixa of sorted) {
    if (descontoPercentual <= faixa.desconto_ate) return faixa.comissao;
  }
  return sorted[sorted.length - 1].comissao;
}

/**
 * Formata valor em BRL (R$ 1.234,56).
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value ?? 0);
}

/**
 * Formata percentual (45.67 -> "45,67%").
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value ?? 0).toFixed(decimals).replace(".", ",")}%`;
}

/**
 * Formata número com separador de milhares (1234 -> "1.234").
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

/**
 * Formata data ISO YYYY-MM-DD para DD/MM/YYYY.
 */
export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/**
 * Soma segura (trata null/undefined).
 */
export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/**
 * Divide com proteção contra zero (retorna 0 se denominador for 0).
 */
export function safeDiv(num: number, den: number): number {
  if (!den || den === 0) return 0;
  return num / den;
}
