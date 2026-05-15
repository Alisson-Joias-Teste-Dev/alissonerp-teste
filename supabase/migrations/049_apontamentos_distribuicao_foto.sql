-- =============================================
-- MIGRATION 049: apontamentos_distribuicao.foto_balanca
-- Adiciona coluna de foto da balança para validação IA.
-- Mudança ADITIVA — apontamentos existentes ficam com NULL.
-- =============================================

ALTER TABLE alissonerp.apontamentos_distribuicao
  ADD COLUMN IF NOT EXISTS foto_balanca TEXT;
