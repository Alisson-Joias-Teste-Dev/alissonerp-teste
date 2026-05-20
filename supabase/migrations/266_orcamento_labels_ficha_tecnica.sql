-- =============================================
-- Migration 266 — Rótulos customizáveis da Ficha Técnica
-- =============================================
-- Adiciona coluna labels_ficha_tecnica JSONB em config_orcamento.
-- Permite o Alisson renomear cada rótulo que aparece na Ficha Técnica
-- enviada pra fábrica (Aro → "Tamanho do dedo", Larg. canal → "Canal
-- de cravação", etc).
--
-- Estrutura: { "aro": "Tamanho", "larg_canal": "Canal", ... }
-- Default '{}' = usa labels padrão do código (sem customização).
-- =============================================

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS labels_ficha_tecnica JSONB DEFAULT '{}'::jsonb;

-- Linhas pré-existentes com NULL → '{}' (caso a coluna já existisse)
UPDATE alissonerp.config_orcamento
SET labels_ficha_tecnica = '{}'::jsonb
WHERE labels_ficha_tecnica IS NULL;
