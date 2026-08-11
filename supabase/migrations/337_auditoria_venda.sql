-- ============================================================
-- Migration 337 — Auditoria: coluna venda_id
-- ============================================================
SET search_path TO alissonerp;

ALTER TABLE auditorias_estoque_itens
  ADD COLUMN IF NOT EXISTS venda_id      INTEGER REFERENCES vendas_erp(id),
  ADD COLUMN IF NOT EXISTS venda_numero  VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_audit_itens_venda ON auditorias_estoque_itens(venda_id) WHERE venda_id IS NOT NULL;

GRANT UPDATE (venda_id, venda_numero) ON auditorias_estoque_itens TO authenticated;
