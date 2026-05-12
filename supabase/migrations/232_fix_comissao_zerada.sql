-- ============================================================
-- Migration 232: Corrigir itens com comissão zerada
--
-- Problema: vendas criadas via orçamento ou com desconto não
-- editado ficavam com pct_comissao / valor_comissao = 0.
--
-- Solução: Para cada item com pct_comissao = 0, recalcula
-- usando a tabela faixas_comissao (mesma lógica do frontend:
-- ROUND(pct_desconto) casa com desconto_pct).
-- ============================================================

-- 0. Diagnóstico: quantos itens/vendas serão afetados?
SELECT
    'faixa 0-30%'                                              AS origem,
    COUNT(*)                                                   AS itens,
    COUNT(DISTINCT ive.venda_id)                               AS vendas,
    ROUND(SUM(ive.total_item * fc.comissao_pct / 100), 2)      AS comissao_a_gerar
FROM alissonerp.itens_venda_erp ive
JOIN alissonerp.faixas_comissao fc
  ON fc.desconto_pct = ROUND(ive.pct_desconto)
 AND fc.ativo = true
WHERE ive.pct_comissao = 0 AND ive.pct_desconto <= 30

UNION ALL

SELECT
    '>30% (fixo 0.5%)'                                        AS origem,
    COUNT(*)                                                   AS itens,
    COUNT(DISTINCT venda_id)                                   AS vendas,
    ROUND(SUM(total_item * 0.5 / 100), 2)                      AS comissao_a_gerar
FROM alissonerp.itens_venda_erp
WHERE pct_comissao = 0 AND pct_desconto > 30

UNION ALL

SELECT
    'TOTAL'                                                    AS origem,
    COUNT(*)                                                   AS itens,
    COUNT(DISTINCT venda_id)                                   AS vendas,
    ROUND(SUM(
        CASE WHEN pct_desconto > 30
            THEN total_item * 0.5 / 100
            ELSE 0
        END
    ), 2)                                                      AS comissao_a_gerar
FROM alissonerp.itens_venda_erp
WHERE pct_comissao = 0;

-- 1. Salvar vendas afetadas antes do UPDATE
CREATE TEMP TABLE IF NOT EXISTS _fix_comissao_vendas AS
SELECT DISTINCT ive.venda_id
FROM alissonerp.itens_venda_erp ive
JOIN alissonerp.faixas_comissao fc
  ON fc.desconto_pct = ROUND(ive.pct_desconto)
 AND fc.ativo = true
WHERE ive.pct_comissao = 0;

-- 2. Corrigir itens: aplicar comissão da faixa (desconto 0%–30%)
UPDATE alissonerp.itens_venda_erp ive
SET
    pct_comissao   = fc.comissao_pct,
    valor_comissao = ROUND((ive.total_item * fc.comissao_pct / 100)::numeric, 2)
FROM alissonerp.faixas_comissao fc
WHERE ive.pct_comissao = 0
  AND ive.pct_desconto <= 30
  AND fc.desconto_pct = ROUND(ive.pct_desconto)
  AND fc.ativo = true;

-- 2b. Corrigir itens: desconto >30% → comissão fixa 0.5%
UPDATE alissonerp.itens_venda_erp
SET
    pct_comissao   = 0.5,
    valor_comissao = ROUND((total_item * 0.5 / 100)::numeric, 2)
WHERE pct_comissao = 0
  AND pct_desconto > 30;

-- 3. Recalcular total_comissao das vendas afetadas
UPDATE alissonerp.vendas_erp ve
SET
    total_comissao = COALESCE((
        SELECT SUM(valor_comissao)
        FROM alissonerp.itens_venda_erp
        WHERE venda_id = ve.id
    ), 0),
    updated_at = NOW()
WHERE ve.id IN (SELECT venda_id FROM _fix_comissao_vendas);

-- 4. Conferência pós-correção
SELECT
    COUNT(*) AS itens_ainda_com_comissao_zero
FROM alissonerp.itens_venda_erp ive
WHERE ive.pct_comissao = 0;

-- 5. Limpeza
DROP TABLE IF EXISTS _fix_comissao_vendas;
