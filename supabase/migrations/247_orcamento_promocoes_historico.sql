-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 247: histórico de campanhas de promoção do orçamento
-- ─────────────────────────────────────────────────────────────────────────────
-- Guarda cada campanha salva (nome, datas, descontos por categoria) para que o
-- usuário possa reativar campanhas antigas sem precisar redigitar tudo.
-- A campanha atualmente ATIVA continua sendo definida pelas colunas
-- promocao_inicio / promocao_fim em alissonerp.config_orcamento.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alissonerp.config_orcamento_promocoes (
  id           BIGSERIAL PRIMARY KEY,
  nome         TEXT        NOT NULL,
  data_inicio  DATE        NOT NULL,
  data_fim     DATE        NOT NULL,
  descontos    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por   UUID        REFERENCES alissonerp.usuarios(id) ON DELETE SET NULL,
  ativada_em   TIMESTAMPTZ,
  CONSTRAINT chk_promo_periodo CHECK (data_inicio <= data_fim)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_promocoes_criado_em
  ON alissonerp.config_orcamento_promocoes (criado_em DESC);

COMMENT ON TABLE  alissonerp.config_orcamento_promocoes IS 'Histórico de campanhas de promoção de orçamento (alianças).';
COMMENT ON COLUMN alissonerp.config_orcamento_promocoes.descontos IS 'Array [{categoria_id, nome, desconto_promocao}] no momento do snapshot.';
COMMENT ON COLUMN alissonerp.config_orcamento_promocoes.ativada_em IS 'Última vez que foi marcada como ativa (NULL = ainda não reativada).';
