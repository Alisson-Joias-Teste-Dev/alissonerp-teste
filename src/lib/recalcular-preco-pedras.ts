/**
 * recalcular-preco-pedras.ts
 * Recalcula preco_pedras e preco_total_sync de um produto com base no BOM.
 *
 * Fórmula por pedra:
 *   custo = preco_compra_usd × cotacao_dolar × markup_faixa × quantidade
 * preco_total_sync = preco_sync (ouro, calculado pelo trigger) + Σ custo_pedras
 *
 * Chamado após INSERT/DELETE em produto_composicao.
 * NÃO recalcula preco_sync do ouro — isso é responsabilidade exclusiva do
 * trigger `trigger_atualizar_preco_produto` em alissonerp.produtos_compat.
 */

import sql from "@/lib/db";

export async function recalcularPrecoPedras(produto_id: number): Promise<number> {
  // 1. Buscar pedras do BOM com preço em USD definido
  const pedras = await sql<{ quantidade: string; tamanho: string | null; preco_compra_usd: string }[]>`
    SELECT quantidade, tamanho, preco_compra_usd
    FROM alissonerp.produto_composicao
    WHERE produto_id = ${produto_id}
      AND tipo = 'pedra'
      AND preco_compra_usd IS NOT NULL
      AND preco_compra_usd > 0
  `;

  if (pedras.length === 0) {
    // BLINDAGEM (16/06/2026 — Jonathan): distinguir "produto SEM pedra" de "tem pedra
    // no BOM mas SEM preco_compra_usd". No 2º caso, NÃO zerar preco_pedras — zerar
    // destrói valor existente (foi o bug que zerou as variações do 1829 a cada save do
    // pai). Só zera de fato quando não há nenhuma pedra na composição.
    // IMPACTO SE REMOVIDO: volta a destruir o preço das pedras em massa.
    const [{ qtd_pedras }] = await sql<{ qtd_pedras: number }[]>`
      SELECT COUNT(*)::int AS qtd_pedras
      FROM alissonerp.produto_composicao
      WHERE produto_id = ${produto_id} AND tipo = 'pedra'
    `;
    if (Number(qtd_pedras) > 0) {
      // Tem pedra no BOM, mas sem USD pra precificar → preserva o valor atual.
      // O preço correto entra quando a variação receber o preco_compra_usd (propagado do pai).
      const [row] = await sql<{ preco_pedras: string | null }[]>`
        SELECT preco_pedras FROM alissonerp.produtos_compat WHERE id_produto = ${produto_id}
      `;
      return Number(row?.preco_pedras ?? 0);
    }
    // Sem pedra nenhuma → zera de fato e sincroniza com o preco_sync do ouro.
    await sql`
      UPDATE alissonerp.erp_produtos
      SET preco_pedras     = 0,
          preco_total_sync = COALESCE(preco_sync, 0)
      WHERE produto_id = ${produto_id}
    `;
    return 0;
  }

  // 2. Cotação dólar atual (public.parametros — fonte de verdade)
  const [params] = await sql<{ dollar: string }[]>`
    SELECT dollar FROM public.parametros LIMIT 1
  `;
  const cotDolar = Number(params?.dollar ?? 5.161);

  // 3. Calcular custo de cada pedra usando faixa de markup por tamanho
  let totalPedras = 0;

  for (const pedra of pedras) {
    const tamanho = Number(pedra.tamanho ?? 0);

    // Lookup faixa exata pelo tamanho em ct
    const [faixa] = await sql<{ markup: string }[]>`
      SELECT markup
      FROM alissonerp.markup_pedras
      WHERE ${tamanho} >= tamanho_min
        AND ${tamanho} < tamanho_max
        AND ativo = true
      ORDER BY tamanho_min
      LIMIT 1
    `;

    let markup: number;
    if (faixa) {
      markup = Number(faixa.markup);
    } else {
      // Fallback: maior faixa disponível (pedra muito grande) ou menor (tamanho 0)
      const [fallback] = await sql<{ markup: string }[]>`
        SELECT markup FROM alissonerp.markup_pedras
        WHERE ativo = true
        ORDER BY CASE WHEN ${tamanho} >= tamanho_min THEN tamanho_min END DESC NULLS LAST,
                 tamanho_min ASC
        LIMIT 1
      `;
      markup = Number(fallback?.markup ?? 2.0);
    }

    totalPedras +=
      Number(pedra.preco_compra_usd) * cotDolar * markup * Number(pedra.quantidade);
  }

  // 4. Persistir no produto
  await sql`
    UPDATE alissonerp.erp_produtos
    SET preco_pedras     = ${totalPedras},
        preco_total_sync = COALESCE(preco_sync, 0) + ${totalPedras}
    WHERE produto_id = ${produto_id}
  `;

  return totalPedras;
}
