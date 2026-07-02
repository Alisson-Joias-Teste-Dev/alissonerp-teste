/**
 * REGRA DE NEGÓCIO — INVENTÁRIO É DE PEÇA PRONTA (v2.81.4):
 * - O que faz: fragmento SQL que diz se um item de inventário é PEÇA PRONTA.
 *   Pedra solta (moissanite, diamante, zircônia...) e personalizada sob
 *   encomenda NÃO entram em contagem de estoque na auditoria — em NENHUM
 *   inventário, inclusive os já abertos (o filtro é na LEITURA, nada é
 *   apagado nem baixado).
 * - Por quê: pedra é matéria-prima em quilates e personalizada (SKU PZ) só
 *   existe depois de encomendada — ambas inflavam o "Faltando" com itens que
 *   ninguém vai contar. Regra do Jonathan.
 * - Critério pedra = espelho SQL de ehPedraSolta() (src/lib/compras-pedras.ts):
 *   categoria 'Pedras%', OU produto_pedra_extras, OU nome COMEÇA com nome de
 *   pedra. NUNCA usar tem_pedra_preciosa (joia COM pedra) nem includes().
 * - Impacto se alterado/removido: pedras/personalizadas voltam a poluir o
 *   inventário e a trava de conclusão conta itens que não existem na vitrine.
 *
 * USO: a consulta precisa expor a coluna do produto como `ii.produto_id`
 * (alias `ii` — padrão das queries de itens_inventario_comercial):
 *   WHERE ... AND ${condPecaPronta(sql)}
 * Para checar uma lista avulsa de produtos, usar unnest com o mesmo alias:
 *   SELECT ii.produto_id FROM unnest(${ids}::bigint[]) AS ii(produto_id)
 *   WHERE NOT ${condPecaPronta(sql)}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function condPecaPronta(sqlx: any) {
  return sqlx`(
    NOT EXISTS (
      SELECT 1 FROM alissonerp.produtos_compat pc
      WHERE pc.id_produto = ii.produto_id
        AND (
          COALESCE(pc.categoria, '') ILIKE 'Pedras%'
          OR pc.nome ILIKE 'diamante%' OR pc.nome ILIKE 'zirc%' OR pc.nome ILIKE 'rubi%'
          OR pc.nome ILIKE 'esmeralda%' OR pc.nome ILIKE 'safira%' OR pc.nome ILIKE 'pedra%'
          OR pc.nome ILIKE 'moissanita%' OR pc.nome ILIKE 'mossainite%'
          -- LIXO DE TESTE (v2.81.5): produtos de teste nunca entram na auditoria
          -- (ex: SKU TESTE-2026-A "Teste Pagamento MP R$ 1,00")
          OR pc.sku ILIKE 'teste%' OR pc.nome ILIKE 'teste%'
          -- OURO É INSUMO (v2.81.5): metal/matéria-prima não é peça de vitrine
          -- (nome de joia começa pelo tipo: "Anel...", "Brinco..." — nunca "Ouro...")
          OR pc.nome ILIKE 'ouro%'
          -- INSUMO/PEDRA/SERVIÇO/PERSONALIZAÇÃO por prefixo de SKU (v2.81.5):
          -- convenção do catálogo (mesma de oportunidades-fabricacao) —
          -- IS=insumo, PD=pedra, AS=serviço (ex: AS1001-2), PZ=personalização
          OR pc.sku ILIKE 'IS%' OR pc.sku ILIKE 'PD%'
          OR pc.sku ILIKE 'AS%' OR pc.sku ILIKE 'PZ%'
          -- Categoria de serviço nunca é estoque físico
          OR COALESCE(pc.categoria, '') ILIKE 'Servi%'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM alissonerp.produto_pedra_extras ppe
      WHERE ppe.produto_id = ii.produto_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM alissonerp.produto_personalizacao pp
      WHERE pp.produto_id = ii.produto_id AND pp.ativo = true
    )
  )`;
}
