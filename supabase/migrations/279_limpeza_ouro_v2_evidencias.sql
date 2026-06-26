-- Migration 279: Limpeza de ouro v2 com evidências por tentativa
-- REGRA DE NEGÓCIO: cada limpeza precisa guardar foto antes, foto depois e,
-- quando houver pedras removidas, peso/foto das pedras para aprovação visual.
-- IMPACTO: sem esta tabela a aprovação continua dependente de texto em obs,
-- perdendo rastreabilidade e podendo aprovar peso/foto incorretos.

CREATE TABLE IF NOT EXISTS alissonerp.limpezas_ouro (
  id                    SERIAL PRIMARY KEY,
  baixa_id              INTEGER NOT NULL REFERENCES alissonerp.cofre_ouro_baixas(id) ON DELETE CASCADE,
  tentativa             INTEGER NOT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'em_limpeza',
  peso_sujo             NUMERIC(10,3) NOT NULL,
  peso_limpo            NUMERIC(10,3),
  perda_bruta_g         NUMERIC(10,3),
  perda_bruta_pct       NUMERIC(7,4),
  perda_ouro_g          NUMERIC(10,3),
  perda_ouro_pct        NUMERIC(7,4),
  houve_pedras          BOOLEAN NOT NULL DEFAULT false,
  peso_pedras           NUMERIC(10,3),
  foto_antes_path       TEXT NOT NULL,
  foto_depois_path      TEXT,
  foto_peso_pedras_path TEXT,
  operador_inicio_id    UUID,
  operador_conclusao_id UUID,
  aprovador_id          UUID,
  motivo_reprovacao     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT limpezas_ouro_status_check CHECK (status IN ('em_limpeza', 'aguardando_aprovacao', 'aprovada', 'reprovada')),
  CONSTRAINT limpezas_ouro_tentativa_check CHECK (tentativa > 0),
  CONSTRAINT limpezas_ouro_peso_sujo_check CHECK (peso_sujo > 0),
  CONSTRAINT limpezas_ouro_peso_limpo_check CHECK (peso_limpo IS NULL OR peso_limpo > 0),
  CONSTRAINT limpezas_ouro_peso_pedras_check CHECK (peso_pedras IS NULL OR peso_pedras > 0),
  CONSTRAINT limpezas_ouro_foto_pedras_check CHECK (
    houve_pedras = false OR (peso_pedras IS NOT NULL AND foto_peso_pedras_path IS NOT NULL AND foto_peso_pedras_path <> '')
  ),
  UNIQUE (baixa_id, tentativa)
);

CREATE INDEX IF NOT EXISTS idx_limpezas_ouro_baixa_id
  ON alissonerp.limpezas_ouro(baixa_id);

CREATE INDEX IF NOT EXISTS idx_limpezas_ouro_status
  ON alissonerp.limpezas_ouro(status);

GRANT SELECT, INSERT, UPDATE ON alissonerp.limpezas_ouro TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.limpezas_ouro_id_seq TO authenticated;
