-- =============================================
-- MIGRATION 050: fechamentos_distribuicao.foto_balanca
-- Adiciona coluna de foto da balança para validação IA na saída por ordem.
-- Mudança ADITIVA — fechamentos existentes ficam com NULL.
-- =============================================

ALTER TABLE alissonerp.fechamentos_distribuicao
  ADD COLUMN IF NOT EXISTS foto_balanca TEXT;
