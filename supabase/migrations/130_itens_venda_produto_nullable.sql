-- ============================================================
-- 130 — Permitir itens_venda_erp sem produto_id
-- Itens vindos de orçamento personalizado não têm produto no catálogo
-- ============================================================

ALTER TABLE alissonerp.itens_venda_erp
  ALTER COLUMN produto_id DROP NOT NULL;
