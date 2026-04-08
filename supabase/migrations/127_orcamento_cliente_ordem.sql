-- ============================================================
-- 127 — Orçamento: vincular cliente + ordem gerada
-- ============================================================

ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES public.contatos(id_contato),
  ADD COLUMN IF NOT EXISTS ordem_gerada_id INTEGER REFERENCES alissonerp.ordens(id);

CREATE INDEX IF NOT EXISTS idx_orcamentos_cliente ON alissonerp.orcamentos(cliente_id);
