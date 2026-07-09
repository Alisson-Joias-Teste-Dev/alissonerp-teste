import "server-only";
import sqlDefault from "@/lib/db";
import {
  getPricingFactors,
  normalizeConfigRow,
  normalizeCategoriaRow,
} from "@/lib/curva-precificacao";

/**
 * Aplica curva de precificacao a UM produto especifico.
 *
 * Le peso_precificado do produto, calcula markup/comissao/max_desconto via
 * getPricingFactors e faz UPSERT em alissonerp.produto_curva_aplicada.
 *
 * NAO escreve mais em alissonerp.produtos_compat.markup — a precificacao foi unificada
 * na curva dinâmica (produto_curva_aplicada.markup_aplicado).
 *
 * Se peso for null/0, retorna { applied: false, motivo: "peso_ausente" } sem fazer
 * nada (comportamento esperado para produtos sem peso definido).
 *
 * Aceita `tx` opcional para rodar dentro de uma transacao existente.
 *
 * SERVER-ONLY: este modulo nunca deve ser importado em Client Components.
 */
 
export async function aplicarCurvaProduto(
  produtoId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
): Promise<{ applied: boolean; markup?: number; comissao_pct?: number; max_desconto_pct?: number; motivo?: string }> {
  const db = tx ?? sqlDefault;

  const [produto] = await db`
    SELECT peso_precificado
    FROM alissonerp.produtos_compat
    WHERE id_produto = ${produtoId}
  `;
  if (!produto) return { applied: false, motivo: "produto_nao_encontrado" };

  const peso = Number(produto.peso_precificado ?? 0);
  if (!Number.isFinite(peso) || peso <= 0) {
    return { applied: false, motivo: "peso_ausente" };
  }

  const [configRow] = await db`
    SELECT start_mkp, start_commission, gold_cost_percentage,
           sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
    FROM alissonerp.curva_config WHERE id = 1
  `;
  if (!configRow) return { applied: false, motivo: "config_ausente" };
  const config = normalizeConfigRow(configRow as Record<string, unknown>);

  const catRows = await db`
    SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
    FROM alissonerp.curva_categorias
    WHERE ativo = true
    ORDER BY ordem ASC
  `;
  if (catRows.length === 0) return { applied: false, motivo: "sem_categorias_ativas" };
  const categorias = (catRows as Record<string, unknown>[]).map(normalizeCategoriaRow);

  const factors = getPricingFactors(peso, config, categorias);
  const markup = Number(factors.mkp.toFixed(4));
  const comissao = Number(factors.commission.toFixed(3));
  const maxDesconto = Number(factors.maxDiscount.toFixed(2));

  await db`
    INSERT INTO alissonerp.produto_curva_aplicada
      (produto_id, comissao_pct, max_desconto_pct, markup_aplicado, updated_at)
    VALUES
      (${produtoId}, ${comissao}, ${maxDesconto}, ${markup}, NOW())
    ON CONFLICT (produto_id) DO UPDATE SET
      comissao_pct     = EXCLUDED.comissao_pct,
      max_desconto_pct = EXCLUDED.max_desconto_pct,
      markup_aplicado  = EXCLUDED.markup_aplicado,
      updated_at       = NOW()
  `;

  // ── Propagar para variacoes filhas ──
  // REGRA DE NEGOCIO: filhos herdam markup/comissao/desconto do pai.
  // Nao recalculamos via getPricingFactors(pesoFilho) porque o peso
  // da variacao nao pode interferir na precificacao — todos os tamanhos
  // de um mesmo modelo tem o mesmo preco de venda.
  const filhos = await db`
    SELECT filho.produto_id
    FROM alissonerp.erp_produtos pai
    JOIN alissonerp.erp_produtos filho ON filho.parent_id = pai.id
    WHERE pai.produto_id = ${produtoId}
      AND filho.eh_variacao = true
  `;

  if (filhos.length > 0) {
    const filhoIds = filhos.map((f: { produto_id: number }) => f.produto_id);
    await db`
      INSERT INTO alissonerp.produto_curva_aplicada
        (produto_id, comissao_pct, max_desconto_pct, markup_aplicado, updated_at)
      SELECT p.produto_id, ${comissao}, ${maxDesconto}, ${markup}, NOW()
      FROM alissonerp.erp_produtos p
      WHERE p.produto_id = ANY(${filhoIds})
      ON CONFLICT (produto_id) DO UPDATE SET
        comissao_pct     = EXCLUDED.comissao_pct,
        max_desconto_pct = EXCLUDED.max_desconto_pct,
        markup_aplicado  = EXCLUDED.markup_aplicado,
        updated_at       = NOW()
    `;
  }

  return { applied: true, markup, comissao_pct: comissao, max_desconto_pct: maxDesconto };
}
