-- ============================================================================
-- Migration 231 — Rota de Fabricação + Reposição Automática
-- ============================================================================
-- Adiciona suporte a:
--   1) Estoque mínimo por produto + flag de reposição automática
--   2) Rota de fabricação por produto (sequência ordenada de setores)
--   3) Etapa atual da rota durante a execução do PCP
--
-- Comportamento esperado (implementado em código):
--   • Quando uma venda baixa o estoque do produto e (saldo + OFs_abertas)
--     fica < estoque_minimo, o sistema cria OFs de fabricação de 1 unidade
--     até cobrir a diferença. A OF cai na etapa 'novas_ordens' do PCP,
--     com setor_id = primeiro setor da rota cadastrada e deposito_id = NULL.
--
-- Segurança: tudo aditivo (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Reposição: estoque mínimo + flag ativa por produto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.produto_reposicao_config (
  produto_id      BIGINT      PRIMARY KEY REFERENCES public.produtos(id_produto) ON DELETE CASCADE,
  estoque_minimo  INTEGER     NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  ativo           BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.produto_reposicao_config IS
  'Configuração de reposição automática por produto. Quando saldo+OFs_abertas < estoque_minimo, cria OFs de fabricação de 1 unidade até cobrir.';

COMMENT ON COLUMN alissonerp.produto_reposicao_config.estoque_minimo IS
  'Saldo mínimo desejado. Reposição se ativa pra (saldo_atual + qtd_em_OFs_abertas) < estoque_minimo.';

COMMENT ON COLUMN alissonerp.produto_reposicao_config.ativo IS
  'Se false, desabilita reposição automática para esse produto (mantém o registro/configuração).';

-- ----------------------------------------------------------------------------
-- 2) Rota de fabricação: sequência ordenada de setores por produto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.produto_rota (
  id          BIGSERIAL   PRIMARY KEY,
  produto_id  BIGINT      NOT NULL REFERENCES public.produtos(id_produto) ON DELETE CASCADE,
  ordem       INTEGER     NOT NULL CHECK (ordem >= 1),
  setor_id    INTEGER     NOT NULL REFERENCES alissonerp.setores(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (produto_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_produto_rota_produto ON alissonerp.produto_rota (produto_id, ordem);
CREATE INDEX IF NOT EXISTS idx_produto_rota_setor   ON alissonerp.produto_rota (setor_id);

COMMENT ON TABLE alissonerp.produto_rota IS
  'Rota de fabricação por produto: lista ordenada de setores que a peça percorre.';

COMMENT ON COLUMN alissonerp.produto_rota.ordem IS
  '1-indexed: primeira etapa = 1, segunda = 2, etc. Único por produto_id.';

-- ----------------------------------------------------------------------------
-- 3) Etapa atual da rota em execução (no PCP)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.pcp
  ADD COLUMN IF NOT EXISTS rota_etapa_atual INTEGER NOT NULL DEFAULT 1 CHECK (rota_etapa_atual >= 1);

COMMENT ON COLUMN alissonerp.pcp.rota_etapa_atual IS
  'Quando a ordem usa rota de fabricação (produto_rota), indica qual etapa (1-indexed) está sendo executada. Default 1 (primeira). Avança quando a fabricação transfere de setor.';

-- ----------------------------------------------------------------------------
-- 4) Rastrear OFs criadas por reposição automática (link OF ↔ produto)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS produto_reposicao_id BIGINT REFERENCES public.produtos(id_produto);

CREATE INDEX IF NOT EXISTS idx_ordens_produto_reposicao
  ON alissonerp.ordens (produto_reposicao_id)
  WHERE produto_reposicao_id IS NOT NULL;

COMMENT ON COLUMN alissonerp.ordens.produto_reposicao_id IS
  'Quando a ordem foi criada pela rotina de reposição automática (estoque < mínimo), aponta pro produto que está sendo reposto. NULL para ordens normais.';

-- ============================================================================
-- Fim migration 231
-- ============================================================================
