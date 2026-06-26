-- Migration 094: locais_estoque — estoque multi-local (Fábrica + Loja)
-- Sprint 1 v2.14.0 | 28/03/2026

-- ──────────────────────────────────────────────────────────
-- 1. CRIAR TABELA locais_estoque
-- ──────────────────────────────────────────────────────────
CREATE TABLE alissonerp.locais_estoque (
  id         SERIAL       PRIMARY KEY,
  nome       VARCHAR(100) NOT NULL,
  ativo      BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 2. SEED — 2 locais iniciais
-- ──────────────────────────────────────────────────────────
INSERT INTO alissonerp.locais_estoque (id, nome) VALUES
  (1, 'Fábrica'),
  (2, 'Loja');

SELECT setval('alissonerp.locais_estoque_id_seq', 2);

-- ──────────────────────────────────────────────────────────
-- 3. FK em depositos
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.depositos
  ADD COLUMN local_estoque_id INTEGER REFERENCES alissonerp.locais_estoque(id);

-- Backfill: todos os depósitos atuais são Fábrica (id=1)
UPDATE alissonerp.depositos SET local_estoque_id = 1;

-- ──────────────────────────────────────────────────────────
-- 4. FK em movimentacoes_estoque (nullable — dados históricos sem local)
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.movimentacoes_estoque
  ADD COLUMN local_estoque_id INTEGER REFERENCES alissonerp.locais_estoque(id);

CREATE INDEX idx_movimentacoes_local_estoque
  ON alissonerp.movimentacoes_estoque(local_estoque_id);

-- ──────────────────────────────────────────────────────────
-- 5. GRANTS
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.locais_estoque TO authenticated, anon;
