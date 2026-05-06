-- ============================================================================
-- Migration 233 — Tempo de Fabricação (dias) por produto
-- ============================================================================
-- Adiciona `tempo_fabricacao_dias` em alissonerp.produto_reposicao_config.
-- Usado para:
--   1) Prazo de entrega que a consultora passa pro cliente
--   2) Calcular `data_entrega` da OF auto-gerada por reposição:
--      data_entrega = CURRENT_DATE + tempo_fabricacao_dias
--
-- A tabela já existia (migration 231) com escopo "config de reposição"; aceito
-- estender pra cobrir também tempo, já que ambos são metadata de produção do
-- produto. Renomeação eventual fica pra refactor futuro.
--
-- Segurança: aditivo (ADD COLUMN IF NOT EXISTS), aceita NULL.
-- ============================================================================

ALTER TABLE alissonerp.produto_reposicao_config
  ADD COLUMN IF NOT EXISTS tempo_fabricacao_dias INTEGER
    CHECK (tempo_fabricacao_dias IS NULL OR tempo_fabricacao_dias >= 0);

COMMENT ON COLUMN alissonerp.produto_reposicao_config.tempo_fabricacao_dias IS
  'Tempo padrão de fabricação da peça em dias. Usado pelo auto-OF (data_entrega = hoje + N) e exibido como prazo informativo no cadastro/drawer do produto.';

-- ============================================================================
-- Fim migration 233
-- ============================================================================
