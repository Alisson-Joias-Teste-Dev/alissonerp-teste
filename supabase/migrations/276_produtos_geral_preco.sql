-- ==========================================================================
-- Migration 276 — View unificada de precificação (joias + pedras)
--
-- REGRA DE NEGÓCIO:
--   vw_produtos_geral_preco unifica as duas fontes de preço:
--     • vw_produto_preco → preço de joias (curva dinâmica, ouro, BOM)
--     • vw_pedras_preco  → preço de pedras/insumos (regras de precificação)
--   A API de listagem de produtos usa esta view como fonte única,
--   eliminando a ambiguidade que causava preços incorretos.
--
--   UNION (sem ALL) garante que não haja duplicatas caso um produto
--   apareça em ambas as views.
-- ==========================================================================
BEGIN;

CREATE OR REPLACE VIEW alissonerp.vw_produtos_geral_preco AS
SELECT id_produto, preco_venda
FROM alissonerp.vw_produto_preco
WHERE preco_venda IS NOT NULL

UNION

SELECT id_produto, preco_venda
FROM alissonerp.vw_pedras_preco
WHERE preco_venda IS NOT NULL;

GRANT SELECT ON alissonerp.vw_produtos_geral_preco TO authenticated, anon;

COMMENT ON VIEW alissonerp.vw_produtos_geral_preco IS
  'View unificada de precificação. Combina vw_produto_preco (joias, curva dinâmica) + vw_pedras_preco (pedras/insumos, regras de precificação). Usada pela API de listagem de produtos como fonte única de preço de venda.';

COMMIT;
