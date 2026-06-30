-- ============================================================
-- Migration 336 — Auditoria de Estoque Comercial
-- Substitui a planilha Excel do Ytalo
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. Tabela: auditorias_estoque
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditorias_estoque (
  id                SERIAL PRIMARY KEY,
  local_estoque_id  INTEGER NOT NULL REFERENCES locais_estoque(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'em_andamento'
                    CHECK (status IN ('em_andamento', 'concluido', 'cancelado')),
  obs               TEXT,
  total_itens       INTEGER NOT NULL DEFAULT 0,
  itens_contados    INTEGER NOT NULL DEFAULT 0,
  itens_divergentes INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id),
  concluido_por     UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conclusao    TIMESTAMPTZ
);

-- ──────────────────────────────────────────────────────────
-- 2. Tabela: auditorias_estoque_itens
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditorias_estoque_itens (
  id                  SERIAL PRIMARY KEY,
  auditoria_id        INTEGER NOT NULL REFERENCES auditorias_estoque(id) ON DELETE CASCADE,
  produto_id          BIGINT NOT NULL,
  sku                 VARCHAR(100),
  nome_produto        VARCHAR(500),
  quantidade_sistema  INTEGER NOT NULL DEFAULT 0,
  quantidade_contada  INTEGER,
  localizacao_fisica  VARCHAR(100),
  consultora          VARCHAR(200),
  status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('ok', 'pendente', 'resolvido', 'aguardando')),
  validado            BOOLEAN GENERATED ALWAYS AS
                      (quantidade_contada IS NOT NULL AND quantidade_contada = quantidade_sistema) STORED,
  observacao          TEXT,
  contado_por         UUID REFERENCES auth.users(id),
  contado_em          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auditoria_id, produto_id)
);

-- ──────────────────────────────────────────────────────────
-- 3. Índices
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_ec_status ON auditorias_estoque(status) WHERE status = 'em_andamento';
CREATE INDEX IF NOT EXISTS idx_audit_itens_auditoria ON auditorias_estoque_itens(auditoria_id);
CREATE INDEX IF NOT EXISTS idx_audit_itens_produto ON auditorias_estoque_itens(produto_id);

-- ──────────────────────────────────────────────────────────
-- 4. Trigger updated_at
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_estoque_itens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_estoque_itens_updated_at ON auditorias_estoque_itens;
CREATE TRIGGER trg_auditoria_estoque_itens_updated_at
  BEFORE UPDATE ON auditorias_estoque_itens
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_estoque_itens_updated_at();

-- ──────────────────────────────────────────────────────────
-- 5. Grants
-- ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON auditorias_estoque TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE auditorias_estoque_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE ON auditorias_estoque_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE auditorias_estoque_itens_id_seq TO authenticated;
