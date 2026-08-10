import sql from "@/lib/db";

/**
 * Saldo disponível de um insumo num depósito, agregando vw_saldo_estoque.
 * REGRA DE NEGÓCIO: SEMPRE SUM(saldo) — a view tem múltiplas linhas por par
 * depósito/insumo (uma por lote/origem); usar LIMIT 1 pega só uma linha e
 * mostra saldo menor do que existe de verdade (pitfall documentado no CLAUDE.md §3).
 * Aceita `sql` (fora de transação) ou `tx` (dentro de `sql.begin()`).
 */
export async function buscarSaldoEstoque(
  executor: typeof sql,
  depositoId: number,
  insumoId: number,
): Promise<number> {
  const [row] = await executor`
    SELECT COALESCE(SUM(saldo), 0) AS saldo
    FROM alissonerp.vw_saldo_estoque
    WHERE deposito_id = ${depositoId} AND insumo_id = ${insumoId}
  `;
  return Number(row?.saldo ?? 0);
}
