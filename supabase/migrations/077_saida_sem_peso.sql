-- Flag indicando que a ordem saiu sem peso (justificativa obrigatória)
ALTER TABLE alissonerp.distribuicao_ordens
  ADD COLUMN IF NOT EXISTS sem_peso BOOLEAN DEFAULT false;

-- Justificativa obrigatória quando sem_peso = true
ALTER TABLE alissonerp.distribuicao_ordens
  ADD COLUMN IF NOT EXISTS justificativa_sem_peso TEXT;

COMMENT ON COLUMN alissonerp.distribuicao_ordens.sem_peso IS
  'Se true, ordem saiu do lote sem peso (serviço, cancelada, fundição falha, etc.)';
COMMENT ON COLUMN alissonerp.distribuicao_ordens.justificativa_sem_peso IS
  'Obrigatória quando sem_peso=true. Motivo pelo qual a ordem não tem peso.';
