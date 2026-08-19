-- Migration 372: conserta a heranca de foto do PAI na vw_produto_capa
-- REGRA DE NEGOCIO:
-- - O que faz: variacao sem foto propria passa a herdar DE VERDADE a capa da
--   peca-pai. A view original (185) comparava capa_propria.produto_id (id de
--   public.produtos) com ep.parent_id (id INTERNO de alissonerp.erp_produtos)
--   - espacos de id diferentes, o fallback "pai" nunca casava.
-- - Por que: 14.711 variacoes no catalogo; centenas aparecem "sem foto" na
--   Gestao de Estoque/galeria/catalogo PDF tendo foto no pai (achado 19/08).
-- - Impacto se alterado/removido: variacoes voltam a ficar sem foto herdada em
--   TODAS as telas que usam a view (gestao-estoque, produtos, ordens, publico).
-- Reversivel: CREATE OR REPLACE; definicao anterior em 185_produto_imagens.sql.

CREATE OR REPLACE VIEW alissonerp.vw_produto_capa AS
WITH capa_propria AS (
  SELECT produto_id, url_publica
  FROM alissonerp.produto_imagens
  WHERE eh_capa
)
SELECT
  p.id_produto AS produto_id,
  COALESCE(
    cp.url_publica,                                -- 1. capa propria do produto
    cp_pai.url_publica,                            -- 2. capa do pai (se variacao) - AGORA pelo id certo
    CASE WHEN p.imagem_capa IS NOT NULL
         THEN 'https://base.alissonranyel.com.br/assets/' || p.imagem_capa::text
         END                                       -- 3. fallback Directus (uuid)
  ) AS url_capa,
  CASE
    WHEN cp.url_publica IS NOT NULL THEN 'propria'
    WHEN cp_pai.url_publica IS NOT NULL THEN 'pai'
    WHEN p.imagem_capa IS NOT NULL THEN 'directus_legacy'
    ELSE NULL
  END AS origem
FROM public.produtos p
LEFT JOIN capa_propria cp ON cp.produto_id = p.id_produto
LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto AND ep.eh_variacao
-- FIX: parent_id aponta pro id INTERNO da erp_produtos; traduzir pro produto_id
-- do public ANTES de buscar a capa do pai (era este o furo da 185).
LEFT JOIN alissonerp.erp_produtos ep_pai ON ep_pai.id = ep.parent_id
LEFT JOIN capa_propria cp_pai ON cp_pai.produto_id = ep_pai.produto_id;

COMMENT ON VIEW alissonerp.vw_produto_capa IS
  'Capa resolvida por produto: capa propria -> capa do pai (variacao, via erp_produtos.parent_id->produto_id, fix 372) -> fallback imagem_capa Directus.';
