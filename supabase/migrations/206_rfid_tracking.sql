-- Migration 206: RFID Tracking - vincula joias_rfid a vendas
-- Permite rastrear cada RFID individualmente: em estoque, vendido, em transito, troca

ALTER TABLE alissonerp.joias_rfid
  ADD COLUMN IF NOT EXISTS venda_id      INTEGER REFERENCES alissonerp.vendas_erp(id),
  ADD COLUMN IF NOT EXISTS item_venda_id INTEGER REFERENCES alissonerp.itens_venda_erp(id),
  ADD COLUMN IF NOT EXISTS sold_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservado_em  TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE alissonerp.joias_rfid DROP CONSTRAINT IF EXISTS joias_rfid_status_check;
END $$;

ALTER TABLE alissonerp.joias_rfid
  ADD CONSTRAINT joias_rfid_status_check
  CHECK (status IN ('ativo', 'pendente_impressao', 'cancelado', 'reservado', 'vendido', 'em_transito', 'troca'));

CREATE INDEX IF NOT EXISTS idx_joias_rfid_venda ON alissonerp.joias_rfid(venda_id) WHERE venda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_joias_rfid_status_produto ON alissonerp.joias_rfid(produto_id, status);
