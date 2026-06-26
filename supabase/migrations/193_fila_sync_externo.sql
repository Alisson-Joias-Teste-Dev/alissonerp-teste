-- Migration 193: alissonerp.fila_sync_externo
-- Fila assíncrona para sincronização com sistemas externos (Tiny, Directus, etc.)
-- Move sync externo para fora das transações de negócio

CREATE TABLE IF NOT EXISTS alissonerp.fila_sync_externo (
  id           BIGSERIAL PRIMARY KEY,
  sistema      VARCHAR(50) NOT NULL,
  acao         VARCHAR(100) NOT NULL DEFAULT 'sync',
  payload      JSONB       NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pendente'
               CHECK (status IN ('pendente', 'processando', 'processado', 'falha_definitiva')),
  tentativas   INTEGER     NOT NULL DEFAULT 0,
  ultimo_erro  TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fila_sync_status_criado
  ON alissonerp.fila_sync_externo (status, criado_em);

CREATE INDEX IF NOT EXISTS idx_fila_sync_sistema
  ON alissonerp.fila_sync_externo (sistema, status);

GRANT SELECT, INSERT, UPDATE ON alissonerp.fila_sync_externo TO authenticated, service_role;
GRANT USAGE ON SEQUENCE alissonerp.fila_sync_externo_id_seq TO authenticated, service_role;
