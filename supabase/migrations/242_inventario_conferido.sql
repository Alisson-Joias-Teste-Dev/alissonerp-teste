-- ============================================================
-- Migration 242 — Coluna "conferido" no inventário
-- Permite marcar itens como conferidos fisicamente via RFID
-- ============================================================

ALTER TABLE alissonerp.itens_inventario_comercial
  ADD COLUMN IF NOT EXISTS conferido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferido_em TIMESTAMPTZ;

-- Index para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_itens_inventario_conferido
  ON alissonerp.itens_inventario_comercial (inventario_id, conferido);
