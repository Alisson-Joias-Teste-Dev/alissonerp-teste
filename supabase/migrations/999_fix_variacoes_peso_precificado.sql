-- ============================================================================
-- Migration: Alinhar peso_precificado das variações com o peso do pai
--
-- REGRA DE NEGÓCIO (08/07/2026):
--   Variações herdam o peso_precificado do pai. O peso individual da
--   variação (regra de regressão) é usado apenas para BOM (consumo de
--   insumos) e não interfere na precificação.
--
--   Ex: Anel 5g com variações nº15..nº25 → todas as variações têm
--   peso_precificado = 5g (peso do modelo base). O markup/preço é o
--   mesmo para todos os tamanhos.
--
-- Executar com: psql ou via Supabase Dashboard (SQL Editor)
-- ============================================================================
BEGIN;

-- 1. Alinhar peso_precificado das variações existentes
UPDATE alissonerp.erp_produtos filho
SET peso_precificado = pai.peso_precificado,
    date_updated = NOW()
FROM alissonerp.erp_produtos pai
WHERE filho.parent_id = pai.id
  AND filho.eh_variacao = TRUE
  AND pai.eh_pai = TRUE
  AND filho.peso_precificado IS DISTINCT FROM pai.peso_precificado;

-- 2. Recalcular produto_curva_aplicada para cada pai (propaga automaticamente
--    para filhos via aplicar-curva-produto.ts atualizado)
--    Este passo roda via aplicação — a migration só alinha os dados.
--    Após o deploy, rode manualmente ou aguarde o próximo "Aplicar em Produtos"
--    da tela de Precificação.

COMMIT;
