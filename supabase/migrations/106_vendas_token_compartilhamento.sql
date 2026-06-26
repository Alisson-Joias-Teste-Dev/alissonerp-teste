-- Migration 106: token de compartilhamento público para orçamentos
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS token_compartilhamento UUID DEFAULT gen_random_uuid();

-- Preencher tokens em vendas existentes
UPDATE alissonerp.vendas_erp
  SET token_compartilhamento = gen_random_uuid()
  WHERE token_compartilhamento IS NULL;

-- Índice único para lookup rápido
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_erp_token
  ON alissonerp.vendas_erp (token_compartilhamento);
