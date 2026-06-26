-- migration 081: estorno de ordem em distribuição
-- Adiciona marcador ESTORNO ao enum + cria tabela de rastreabilidade

-- 1. Novo marcador de estorno
ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE IF NOT EXISTS 'ESTORNO';

-- 2. Tabela de registro de estornos (snapshot JSONB para auditoria total)
CREATE TABLE IF NOT EXISTS alissonerp.estornos_distribuicao (
  id               SERIAL PRIMARY KEY,
  distribuicao_id  INTEGER      NOT NULL REFERENCES alissonerp.distribuicoes(id),
  ordem_id         INTEGER      NOT NULL REFERENCES alissonerp.ordens(id),
  motivo           VARCHAR(50)  NOT NULL,
  justificativa    TEXT         NOT NULL,
  estornado_por    UUID         NOT NULL,
  -- Snapshot completo do que foi revertido (apontamentos, saída, movimentações, PCP delta)
  dados_revertidos JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estornos_dist_ordem ON alissonerp.estornos_distribuicao(ordem_id);
CREATE INDEX IF NOT EXISTS idx_estornos_dist_dist  ON alissonerp.estornos_distribuicao(distribuicao_id);

GRANT SELECT, INSERT ON alissonerp.estornos_distribuicao TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.estornos_distribuicao_id_seq TO authenticated;

COMMENT ON TABLE alissonerp.estornos_distribuicao IS
  'Registro imutável de cada estorno — quem, quando, por quê, snapshot JSONB do que foi revertido';
