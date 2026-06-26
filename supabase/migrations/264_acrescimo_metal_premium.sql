-- =============================================
-- Migration 264 — Acrescimo metal premium no orcamento
-- =============================================
-- Adiciona coluna acrescimo_metal_premium em config_orcamento.
-- Quando aliança tem metal = Ouro Branco ou Ouro Rose, o preço base
-- recebe esse acréscimo (%) ANTES do desconto.
--
-- Default 30 = +30% no branco/rose.
-- Range 0-100 (0 = desliga, sem acréscimo).
--
-- Aplicado apenas em alianças (módulo orçamento). Peças avulsas e
-- produtos cadastrados não usam esse campo.
-- =============================================

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS acrescimo_metal_premium NUMERIC(5,2) DEFAULT 30;

-- CHECK 0-100 (idempotente)
ALTER TABLE alissonerp.config_orcamento
  DROP CONSTRAINT IF EXISTS chk_acrescimo_metal_premium;
ALTER TABLE alissonerp.config_orcamento
  ADD CONSTRAINT chk_acrescimo_metal_premium
  CHECK (acrescimo_metal_premium >= 0 AND acrescimo_metal_premium <= 100);

-- Linhas pré-existentes (caso a coluna já existisse com NULL)
UPDATE alissonerp.config_orcamento
SET acrescimo_metal_premium = 30
WHERE acrescimo_metal_premium IS NULL;
