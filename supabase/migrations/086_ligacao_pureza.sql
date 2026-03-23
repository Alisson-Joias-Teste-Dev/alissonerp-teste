-- MIGRATION 086: Adicionar coluna pureza em ligacoes
ALTER TABLE alissonerp.ligacoes
  ADD COLUMN IF NOT EXISTS pureza NUMERIC(5,2) NOT NULL DEFAULT 100.00;

COMMENT ON COLUMN alissonerp.ligacoes.pureza IS
  'Pureza do ouro de entrada (100=24k puro, 75=18k, 58.3=14k)';
