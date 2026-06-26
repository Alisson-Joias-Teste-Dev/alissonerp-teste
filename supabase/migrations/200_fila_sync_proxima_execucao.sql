-- Migration 200: adicionar proxima_execucao à fila_sync_externo
-- Necessário para retry exponencial — worker só pega itens com proxima_execucao <= NOW()

ALTER TABLE alissonerp.fila_sync_externo
  ADD COLUMN IF NOT EXISTS proxima_execucao TIMESTAMPTZ NULL;

-- Índice para o worker buscar eficientemente itens elegíveis
CREATE INDEX IF NOT EXISTS idx_fila_sync_pendente
  ON alissonerp.fila_sync_externo (status, proxima_execucao)
  WHERE status = 'pendente';
