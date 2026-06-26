-- Migration 173: fila de sincronização produtos → Tiny
-- fabricaAJ é o sistema central; Tiny é receptor.
-- Cada produto criado/editado entra na fila; cron processa em lotes respeitando rate limit.

CREATE TABLE IF NOT EXISTS alissonerp.tiny_sync_produtos (
  produto_id   BIGINT       PRIMARY KEY,
  operacao     TEXT         NOT NULL CHECK (operacao IN ('create', 'update')),
  status       TEXT         NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'ok', 'erro')),
  tentativas   INT          NOT NULL DEFAULT 0,
  erro         TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiny_sync_produtos_status ON alissonerp.tiny_sync_produtos (status, updated_at);
