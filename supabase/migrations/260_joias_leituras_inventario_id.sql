-- Adiciona inventario_id em joias_leituras para vincular leituras RFID
-- diretamente ao inventario ao qual pertencem (evita filtro por data)

ALTER TABLE alissonerp.joias_leituras
  ADD COLUMN IF NOT EXISTS inventario_id INTEGER
    REFERENCES alissonerp.inventarios_comercial(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_joias_leituras_inventario_id
  ON alissonerp.joias_leituras (inventario_id)
  WHERE inventario_id IS NOT NULL;

COMMENT ON COLUMN alissonerp.joias_leituras.inventario_id IS
  'FK para inventarios_comercial quando evento=inventario. NULL para outros eventos.';
