-- =============================================
-- Migration 263 — Teor de ouro padrão no orçamento
-- =============================================
-- Adiciona coluna teor_ouro_default em config_orcamento.
-- Permite Alisson definir o teor (% de ouro puro) usado pra calcular
-- a densidade e o peso das alianças. Valores aceitos: 67% a 75%.
-- Default 75% = ouro 18k tradicional.
--
-- A densidade é calculada em runtime no frontend a partir do teor +
-- cor do metal (ver src/app/(dashboard)/orcamento/constants.ts →
-- função densidadePorTeor).
-- =============================================

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS teor_ouro_default INTEGER DEFAULT 75;

-- CHECK 67-75 (idempotente)
ALTER TABLE alissonerp.config_orcamento
  DROP CONSTRAINT IF EXISTS chk_teor_ouro_default;
ALTER TABLE alissonerp.config_orcamento
  ADD CONSTRAINT chk_teor_ouro_default CHECK (teor_ouro_default BETWEEN 67 AND 75);

-- Garante que linhas pré-existentes ficam com 75 (caso a coluna já existisse com NULL)
UPDATE alissonerp.config_orcamento
SET teor_ouro_default = 75
WHERE teor_ouro_default IS NULL;
