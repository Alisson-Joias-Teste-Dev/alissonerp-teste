-- ============================================================================
-- 186: View vw_produto_imagens — array agregado de imagens por produto
-- ============================================================================
-- Agrega todas as fotos de produto_imagens em jsonb, com fallback automático
-- para variações (que herdam do pai). Permite que listagens da API retornem a
-- galeria completa em uma única query, sem N+1.
-- ============================================================================

CREATE OR REPLACE VIEW alissonerp.vw_produto_imagens AS
WITH agregado AS (
  SELECT
    produto_id,
    jsonb_agg(
      jsonb_build_object(
        'id',      id,
        'url',     url_publica,
        'eh_capa', eh_capa,
        'ordem',   ordem,
        'origem',  origem
      )
      ORDER BY eh_capa DESC, ordem ASC
    ) AS imagens
  FROM alissonerp.produto_imagens
  GROUP BY produto_id
)
SELECT
  p.id_produto AS produto_id,
  COALESCE(prop.imagens, pai.imagens, '[]'::jsonb) AS imagens,
  CASE
    WHEN prop.imagens IS NOT NULL THEN 'propria'
    WHEN pai.imagens  IS NOT NULL THEN 'pai'
    ELSE 'vazia'
  END AS origem_galeria
FROM public.produtos p
LEFT JOIN agregado prop ON prop.produto_id = p.id_produto
LEFT JOIN alissonerp.erp_produtos ep
       ON ep.produto_id = p.id_produto AND ep.eh_variacao
LEFT JOIN agregado pai ON pai.produto_id = ep.parent_id;

COMMENT ON VIEW alissonerp.vw_produto_imagens IS
  'Galeria completa por produto em jsonb. Variações herdam do pai automaticamente. Cada elemento: {id, url, eh_capa, ordem, origem}. Usar em SELECT como vi.imagens.';
