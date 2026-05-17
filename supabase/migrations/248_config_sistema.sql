-- =====================================================================
-- Migration 248: Tabela de configurações gerais do sistema
-- =====================================================================

CREATE TABLE IF NOT EXISTS alissonerp.config_sistema (
  id                        SMALLINT PRIMARY KEY DEFAULT 1,
  comentarios_ordens_ativo  BOOLEAN NOT NULL DEFAULT true,
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT config_sistema_single_row CHECK (id = 1)
);

INSERT INTO alissonerp.config_sistema (id)
VALUES (1)
ON CONFLICT DO NOTHING;

GRANT SELECT ON alissonerp.config_sistema TO anon, authenticated, service_role;
GRANT UPDATE ON alissonerp.config_sistema TO service_role;
