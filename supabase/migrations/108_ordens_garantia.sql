-- ============================================================
-- Migration 108 — Ordem de Garantia
-- Adiciona referência à venda e itens de garantia em ordens
-- ============================================================

-- 1. Referência à venda ERP (para garantia)
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS venda_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- 2. IDs dos itens da venda que estão sob garantia
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS venda_item_ids INTEGER[];

-- 3. Índice para buscar ordens de garantia por venda
CREATE INDEX IF NOT EXISTS idx_ordens_venda_id
  ON alissonerp.ordens (venda_id)
  WHERE venda_id IS NOT NULL;

-- 4. Adicionar "Outros" em tipos_servico (estava na imagem do cliente mas não no banco)
INSERT INTO alissonerp.tipos_servico (nome)
  SELECT 'Outros'
  WHERE NOT EXISTS (SELECT 1 FROM alissonerp.tipos_servico WHERE nome = 'Outros');
