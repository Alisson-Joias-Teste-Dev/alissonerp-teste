-- Migration 158: ficha_pendente em ordens
-- Indica que a ordem de fabricação aguarda preenchimento da ficha técnica
-- antes de ser liberada para o PCP.

ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS ficha_pendente BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN alissonerp.ordens.ficha_pendente IS
  'TRUE = ficha técnica incompleta; ordem aguarda preenchimento antes de ir para PCP';
