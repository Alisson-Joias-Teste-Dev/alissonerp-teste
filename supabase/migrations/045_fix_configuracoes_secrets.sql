-- =============================================
-- MIGRATION 045: FIX — criar configuracoes_secrets
-- A migration 044 pode não ter rodado completamente.
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.configuracoes_secrets (
  id               SERIAL PRIMARY KEY,
  chave            VARCHAR(100) UNIQUE NOT NULL,
  valor_encrypted  TEXT NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       UUID
);

GRANT SELECT, INSERT, UPDATE ON alissonerp.configuracoes_secrets TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.configuracoes_secrets_id_seq TO authenticated;
