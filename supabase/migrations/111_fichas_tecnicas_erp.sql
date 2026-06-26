-- ============================================================
-- Migration 111 — Fichas Técnicas ERP
--
-- Tabela para fichas técnicas criadas no ERP (directus é READONLY).
-- Usa JSONB para campos dinâmicos por tipo de item.
-- ============================================================

CREATE TABLE IF NOT EXISTS alissonerp.fichas_tecnicas (
  id            SERIAL PRIMARY KEY,
  ordem_id      INTEGER REFERENCES alissonerp.ordens(id),
  tipo_item     VARCHAR(50) NOT NULL,
  dados         JSONB NOT NULL DEFAULT '{}',
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fichas_tecnicas_ordem_id ON alissonerp.fichas_tecnicas(ordem_id);

GRANT SELECT, INSERT, UPDATE ON alissonerp.fichas_tecnicas TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.fichas_tecnicas_id_seq TO authenticated;
