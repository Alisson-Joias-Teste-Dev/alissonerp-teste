-- Adiciona coluna categoria na tabela de inventarios comerciais
ALTER TABLE alissonerp.inventarios_comercial
  ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Index para consultas por categoria
CREATE INDEX IF NOT EXISTS idx_inventarios_comercial_categoria
  ON alissonerp.inventarios_comercial (categoria);
