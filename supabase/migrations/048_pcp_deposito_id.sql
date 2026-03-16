-- =============================================
-- MIGRATION 048: pcp.deposito_id
-- Adiciona depósito/operador ao PCP para rastrear em qual operador a ordem está.
-- Preenchido ao criar distribuição (POST /api/distribuicao).
-- Mudança ADITIVA — PCPs existentes ficam com NULL (sem operador definido ainda).
-- =============================================

ALTER TABLE alissonerp.pcp
  ADD COLUMN IF NOT EXISTS deposito_id INTEGER REFERENCES alissonerp.depositos(id);
