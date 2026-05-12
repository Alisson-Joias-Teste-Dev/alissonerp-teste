-- Migration 203: Locais de Estoque - Motoboy e Em Transito
-- Adiciona hierarquia + warehouses de logistica

ALTER TABLE alissonerp.locais_estoque
  ADD COLUMN IF NOT EXISTS parent_local_id INTEGER REFERENCES alissonerp.locais_estoque(id),
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_negative BOOLEAN NOT NULL DEFAULT false;

UPDATE alissonerp.locais_estoque SET is_group = true WHERE id = 1;
UPDATE alissonerp.locais_estoque SET is_group = false WHERE id IN (2,3,4);

INSERT INTO alissonerp.locais_estoque (id, nome, parent_local_id, is_group, allow_negative) VALUES
  (5, 'Motoboy [Nome]', 6, false, false),
  (6, 'Em Transito',   NULL, true, true),
  (7, 'Terceiro',       NULL, false, false)
ON CONFLICT (id) DO NOTHING;

SELECT setval('alissonerp.locais_estoque_id_seq', GREATEST(7, (SELECT MAX(id) FROM alissonerp.locais_estoque)));

CREATE OR REPLACE VIEW alissonerp.vw_saldo_motoboy AS
SELECT
  sle.item_id,
  sle.item_type,
  sle.warehouse_id,
  l.nome AS warehouse_nome,
  COALESCE(SUM(CASE WHEN NOT sle.is_cancelled THEN sle.actual_qty ELSE 0 END), 0)::NUMERIC(16,4) AS saldo_fisico,
  COUNT(*) FILTER (WHERE NOT sle.is_cancelled) AS total_movimentacoes,
  MAX(sle.posting_date) FILTER (WHERE NOT sle.is_cancelled) AS ultima_movimentacao
FROM alissonerp.stock_ledger_entry sle
JOIN alissonerp.locais_estoque l ON l.id = sle.warehouse_id
WHERE l.id = 5
GROUP BY sle.item_id, sle.item_type, sle.warehouse_id, l.nome
HAVING COALESCE(SUM(CASE WHEN NOT sle.is_cancelled THEN sle.actual_qty ELSE 0 END), 0) != 0;

GRANT SELECT ON alissonerp.vw_saldo_motoboy TO authenticated;
