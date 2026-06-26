-- ============================================================
-- 129 — Vincular orçamento ↔ venda ↔ ordem
-- ============================================================

-- Orçamento → Venda gerada
ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS venda_gerada_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- Venda → Orçamento de origem
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS orcamento_id INTEGER REFERENCES alissonerp.orcamentos(id);

CREATE INDEX IF NOT EXISTS idx_vendas_orcamento ON alissonerp.vendas_erp(orcamento_id) WHERE orcamento_id IS NOT NULL;
