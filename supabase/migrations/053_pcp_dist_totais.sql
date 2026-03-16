-- Migration 053: Campos de rastreamento da saída de distribuição no PCP
-- Armazena o resultado da saída do artesão (peso_ouro_real, pedras, quebra)
-- para exibição no painel de detalhe do PCP

ALTER TABLE alissonerp.pcp
  ADD COLUMN IF NOT EXISTS dist_ouro_real   real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dist_pedras_qtd  real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dist_pedras_g    real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dist_quebra      real DEFAULT 0;

COMMENT ON COLUMN alissonerp.pcp.dist_ouro_real  IS 'Soma de distribuicao_ordens.peso_ouro_real para todas as saídas desta ordem';
COMMENT ON COLUMN alissonerp.pcp.dist_pedras_qtd IS 'Soma de qtd_utilizada de distribuicao_saida_pedras para esta ordem';
COMMENT ON COLUMN alissonerp.pcp.dist_pedras_g   IS 'Soma de peso_total de distribuicao_saida_pedras para esta ordem';
COMMENT ON COLUMN alissonerp.pcp.dist_quebra     IS 'Soma de distribuicao_ordens.quebra para todas as saídas desta ordem';
