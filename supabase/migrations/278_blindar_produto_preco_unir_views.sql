-- ==========================================================================
-- Migration 278 — Blindar vw_produto_preco + criar vw_produtos_geral_preco
--
-- FASE 1: vw_produto_preco exclui pedras → precifica apenas joias/serviços
-- FASE 2: vw_produtos_geral_preco = vw_produto_preco + vw_pedras_preco
-- ==========================================================================
BEGIN;

-- ── FASE 1: Recriar vw_produto_preco excluindo pedras ──────────────────────
-- Adiciona WHERE para ignorar produtos com categoria='Pedras'
CREATE OR REPLACE VIEW alissonerp.vw_produto_preco AS
SELECT p.id_produto,
       CASE
           WHEN ti.tipo_item = 'servico'::text THEN ep.preco_servico
           WHEN p.peso_precificado > 0::double precision
                AND cpa.markup_aplicado > 0::numeric
                AND (( SELECT parametros.ouro FROM parametros LIMIT 1)) > 0::double precision
           THEN (round(p.peso_precificado::numeric
                 * (( SELECT parametros.ouro FROM parametros LIMIT 1))::numeric
                 * cpa.markup_aplicado::numeric
                 * COALESCE(p.fator::numeric, 1::numeric)
                 / 10::numeric)::integer * 10)::numeric
                + COALESCE(p.preco_pedras, 0::numeric)
           ELSE NULL::numeric
       END AS preco_venda,
       CASE
           WHEN ti.tipo_item = 'servico'::text THEN NULL::numeric
           WHEN p.peso_precificado > 0::double precision
                AND cpa.markup_aplicado > 0::numeric
                AND (( SELECT parametros.ouro FROM parametros LIMIT 1)) > 0::double precision
           THEN (round(p.peso_precificado::numeric
                 * (( SELECT parametros.ouro FROM parametros LIMIT 1))::numeric
                 * cpa.markup_aplicado::numeric
                 * COALESCE(p.fator::numeric, 1::numeric)
                 / 10::numeric)::integer * 10)::numeric
           ELSE NULL::numeric
       END AS preco_ouro_curva,
       COALESCE(p.preco_pedras, 0::numeric) AS preco_pedras
FROM produtos p
LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
WHERE (p.categoria IS NULL OR p.categoria != 'Pedras');

GRANT SELECT ON alissonerp.vw_produto_preco TO authenticated, anon;

-- ── FASE 2: Criar view unificada ───────────────────────────────────────────
DROP VIEW IF EXISTS alissonerp.vw_produtos_geral_preco;

CREATE VIEW alissonerp.vw_produtos_geral_preco AS
SELECT id_produto, preco_venda
FROM alissonerp.vw_produto_preco
WHERE preco_venda IS NOT NULL

UNION

SELECT id_produto, preco_venda
FROM alissonerp.vw_pedras_preco
WHERE preco_venda IS NOT NULL;

GRANT SELECT ON alissonerp.vw_produtos_geral_preco TO authenticated, anon;

COMMENT ON VIEW alissonerp.vw_produtos_geral_preco IS
  'View unificada de precificação: vw_produto_preco (joias, excluindo Pedras) + vw_pedras_preco (pedras/insumos). Fonte única de preço de venda para a API de listagem.';

COMMIT;
