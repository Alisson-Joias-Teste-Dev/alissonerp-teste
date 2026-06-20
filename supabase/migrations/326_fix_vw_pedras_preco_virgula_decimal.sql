-- Migration 326: Corrige vw_pedras_preco -- cast numeric falha com virgula decimal
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
SELECT
  p.id_produto, p.nome, p.sku, ppe.peso_ct,
  r.categoria_pedra, r.nome_tabela, r.custo_usd_ct, r.preco_rs_un,
  CASE
    WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL
    THEN round(
           r.markup_inicial
           - (r.markup_inicial - r.markup_final)
             * (REPLACE(COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0'), ',', '.')::numeric
                - r.tamanho_inicial_mm)
             / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0),
           4)
    WHEN r.preco_rs_un IS NOT NULL THEN NULL
    ELSE r.markup_inicial
  END AS markup_calculado,
  CASE
    WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0 THEN r.preco_rs_un::integer
    WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0 AND ppe.peso_ct IS NOT NULL
    THEN round(
           ppe.peso_ct * r.custo_usd_ct
           * (SELECT parametros.dollar FROM parametros LIMIT 1)
           * CASE
               WHEN r.tamanho_final_mm > r.tamanho_inicial_mm
               THEN r.markup_inicial
                    - (r.markup_inicial - r.markup_final)
                      * (REPLACE(COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0'), ',', '.')::numeric
                         - r.tamanho_inicial_mm)
                      / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0)
               ELSE r.markup_inicial
             END
         )::integer
    ELSE NULL
  END AS preco_venda
FROM public.produtos p
JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
LEFT JOIN LATERAL (
  SELECT * FROM alissonerp.pedras_precificacao_regras r2
  WHERE (
    LOWER(p.nome) ILIKE '%' || LOWER(r2.categoria_pedra) || '%'
    OR (r2.categoria_pedra = 'zirconia' AND LOWER(p.nome) ILIKE '%zirc%')
  )
  AND (
    (
      REPLACE(COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0'), ',', '.')::numeric >= r2.tamanho_inicial_mm
      AND REPLACE(COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0'), ',', '.')::numeric <= r2.tamanho_final_mm
    )
    OR r2.categoria_pedra = 'zirconia'
  )
  ORDER BY r2.tamanho_inicial_mm ASC
  LIMIT 1
) r ON true
WHERE ti.tipo_item = 'insumo'
  AND p.situacao = 'A'
  AND p.categoria = 'Pedras';

GRANT SELECT ON alissonerp.vw_pedras_preco TO authenticated, anon;
