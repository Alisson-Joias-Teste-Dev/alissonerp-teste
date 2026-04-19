-- ============================================================
-- 124 — Campo is_transportador em usuarios
--       Identifica quem pode transportar peças (fábrica ↔ service)
-- ============================================================

ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS is_transportador BOOLEAN NOT NULL DEFAULT false;

-- Backfill: motoboys existentes viram transportadores
UPDATE alissonerp.usuarios
SET is_transportador = true
WHERE role = 'motoboy' AND ativo = true;
