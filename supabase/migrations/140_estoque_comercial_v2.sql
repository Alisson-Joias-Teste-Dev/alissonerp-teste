-- ============================================================
-- Migration 140 — Estoque Comercial v2: Sistema 360
-- Multi-local | Reservas | Transferencias | Inventario | Rastreabilidade
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. NOVOS LOCAIS DE ESTOQUE (Vitrine + Cofre)
-- ──────────────────────────────────────────────────────────
INSERT INTO locais_estoque (id, nome) VALUES (3, 'Vitrine')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO locais_estoque (id, nome) VALUES (4, 'Cofre')
  ON CONFLICT (id) DO NOTHING;

SELECT setval('locais_estoque_id_seq', GREATEST(
  (SELECT MAX(id) FROM locais_estoque), 4
));

-- ──────────────────────────────────────────────────────────
-- 2. NOVAS COLUNAS em movimentacoes_estoque_comercial
-- ──────────────────────────────────────────────────────────
ALTER TABLE movimentacoes_estoque_comercial
  ADD COLUMN IF NOT EXISTS local_estoque_id  INTEGER DEFAULT 2 REFERENCES locais_estoque(id),
  ADD COLUMN IF NOT EXISTS status            VARCHAR(20) DEFAULT 'efetivado',
  ADD COLUMN IF NOT EXISTS estorno_de_id     INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  ADD COLUMN IF NOT EXISTS estornado_por_id  INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  ADD COLUMN IF NOT EXISTS ordem_id          INTEGER,
  ADD COLUMN IF NOT EXISTS protocolo_id      INTEGER;

-- CHECK constraint para status
DO $$ BEGIN
  ALTER TABLE movimentacoes_estoque_comercial
    ADD CONSTRAINT chk_mov_ec_status CHECK (status IN ('efetivado', 'estornado'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: todos os registros existentes sao efetivados no local Loja
UPDATE movimentacoes_estoque_comercial SET status = 'efetivado' WHERE status IS NULL;
UPDATE movimentacoes_estoque_comercial SET local_estoque_id = 2 WHERE local_estoque_id IS NULL;

-- Permitir UPDATE na tabela (antes era so SELECT, INSERT)
GRANT UPDATE ON movimentacoes_estoque_comercial TO authenticated;

-- ──────────────────────────────────────────────────────────
-- 3. TABELA: reservas_estoque_comercial
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservas_estoque_comercial (
  id                SERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL,
  venda_id          INTEGER NOT NULL REFERENCES vendas_erp(id) ON DELETE CASCADE,
  item_venda_id     INTEGER NOT NULL REFERENCES itens_venda_erp(id) ON DELETE CASCADE,
  quantidade        INTEGER NOT NULL CHECK (quantidade > 0),
  local_estoque_id  INTEGER NOT NULL DEFAULT 2 REFERENCES locais_estoque(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'efetivado', 'cancelado')),
  efetivado_em      TIMESTAMPTZ,
  cancelado_em      TIMESTAMPTZ,
  movimento_id      INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 4. TABELA: transferencias_estoque_comercial
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencias_estoque_comercial (
  id                  SERIAL PRIMARY KEY,
  produto_id          BIGINT NOT NULL,
  quantidade          INTEGER NOT NULL CHECK (quantidade > 0),
  local_origem_id     INTEGER NOT NULL REFERENCES locais_estoque(id),
  local_destino_id    INTEGER NOT NULL REFERENCES locais_estoque(id),
  status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente', 'concluido', 'cancelado')),
  obs                 TEXT,
  enviado_por         UUID REFERENCES auth.users(id),
  recebido_por        UUID REFERENCES auth.users(id),
  recebido_em         TIMESTAMPTZ,
  cancelado_em        TIMESTAMPTZ,
  movimento_saida_id  INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  movimento_entrada_id INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (local_origem_id != local_destino_id)
);

-- ──────────────────────────────────────────────────────────
-- 5. TABELAS: inventario fisico
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventarios_comercial (
  id                SERIAL PRIMARY KEY,
  local_estoque_id  INTEGER NOT NULL REFERENCES locais_estoque(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'aberto'
                    CHECK (status IN ('aberto', 'em_contagem', 'concluido', 'cancelado')),
  obs               TEXT,
  data_abertura     TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conclusao    TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  concluido_por     UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS itens_inventario_comercial (
  id                  SERIAL PRIMARY KEY,
  inventario_id       INTEGER NOT NULL REFERENCES inventarios_comercial(id) ON DELETE CASCADE,
  produto_id          BIGINT NOT NULL,
  quantidade_sistema  INTEGER NOT NULL DEFAULT 0,
  quantidade_contada  INTEGER,
  diferenca           INTEGER GENERATED ALWAYS AS (COALESCE(quantidade_contada, 0) - quantidade_sistema) STORED,
  movimento_ajuste_id INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  contado_por         UUID REFERENCES auth.users(id),
  contado_em          TIMESTAMPTZ,
  UNIQUE(inventario_id, produto_id)
);

-- ──────────────────────────────────────────────────────────
-- 6. INDICES
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mov_ec_local        ON movimentacoes_estoque_comercial(local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_mov_ec_status       ON movimentacoes_estoque_comercial(status);
CREATE INDEX IF NOT EXISTS idx_mov_ec_estorno_de   ON movimentacoes_estoque_comercial(estorno_de_id)
  WHERE estorno_de_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reservas_ec_venda   ON reservas_estoque_comercial(venda_id);
CREATE INDEX IF NOT EXISTS idx_reservas_ec_produto ON reservas_estoque_comercial(produto_id, local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_reservas_ec_ativo   ON reservas_estoque_comercial(status)
  WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS idx_transf_ec_status    ON transferencias_estoque_comercial(status)
  WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_transf_ec_produto   ON transferencias_estoque_comercial(produto_id);

CREATE INDEX IF NOT EXISTS idx_inv_ec_status       ON inventarios_comercial(status)
  WHERE status IN ('aberto', 'em_contagem');
CREATE INDEX IF NOT EXISTS idx_itens_inv_ec_inv    ON itens_inventario_comercial(inventario_id);

-- ──────────────────────────────────────────────────────────
-- 7. VIEW: saldo v2 (fisico + reservado + disponivel + em_transito) por local
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_saldo_estoque_comercial_v2 AS
WITH mov_agg AS (
  SELECT
    produto_id,
    local_estoque_id,
    COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0) AS saldo_fisico,
    COUNT(id) AS total_movimentacoes,
    MAX(created_at) AS ultima_movimentacao
  FROM movimentacoes_estoque_comercial
  WHERE status = 'efetivado'
  GROUP BY produto_id, local_estoque_id
),
reservas_agg AS (
  SELECT produto_id, local_estoque_id, SUM(quantidade) AS total_reservado
  FROM reservas_estoque_comercial
  WHERE status = 'ativo'
  GROUP BY produto_id, local_estoque_id
),
transito_agg AS (
  SELECT produto_id, local_destino_id AS local_estoque_id, SUM(quantidade) AS em_transito
  FROM transferencias_estoque_comercial
  WHERE status = 'pendente'
  GROUP BY produto_id, local_destino_id
)
SELECT
  p.id_produto                              AS produto_id,
  p.nome                                    AS nome_produto,
  p.sku,
  COALESCE(p.categoria, '')                 AS categoria,
  cfg.id                                    AS config_id,
  COALESCE(cfg.estoque_minimo, 0)           AS estoque_minimo,
  cfg.ativo,
  m.local_estoque_id,
  le.nome                                   AS local_nome,
  COALESCE(m.saldo_fisico, 0)::INTEGER      AS saldo_fisico,
  COALESCE(r.total_reservado, 0)::INTEGER   AS reservado,
  (COALESCE(m.saldo_fisico, 0)
   - COALESCE(r.total_reservado, 0))::INTEGER AS disponivel,
  COALESCE(t.em_transito, 0)::INTEGER       AS em_transito,
  COALESCE(m.total_movimentacoes, 0)::INTEGER AS total_movimentacoes,
  m.ultima_movimentacao
FROM public.produtos p
INNER JOIN estoque_comercial_config cfg
  ON cfg.produto_id = p.id_produto AND cfg.ativo = true
LEFT JOIN mov_agg m ON m.produto_id = p.id_produto
LEFT JOIN locais_estoque le ON le.id = m.local_estoque_id
LEFT JOIN reservas_agg r
  ON r.produto_id = p.id_produto AND r.local_estoque_id = m.local_estoque_id
LEFT JOIN transito_agg t
  ON t.produto_id = p.id_produto AND t.local_estoque_id = m.local_estoque_id;

-- ──────────────────────────────────────────────────────────
-- 8. VIEW: saldo consolidado (sem local — visao geral)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_saldo_estoque_comercial_consolidado AS
SELECT
  produto_id,
  nome_produto,
  sku,
  categoria,
  config_id,
  estoque_minimo,
  ativo,
  SUM(saldo_fisico)::INTEGER            AS saldo_fisico,
  SUM(reservado)::INTEGER               AS reservado,
  SUM(disponivel)::INTEGER              AS disponivel,
  SUM(em_transito)::INTEGER             AS em_transito,
  SUM(total_movimentacoes)::INTEGER     AS total_movimentacoes,
  MAX(ultima_movimentacao)              AS ultima_movimentacao
FROM vw_saldo_estoque_comercial_v2
GROUP BY produto_id, nome_produto, sku, categoria, config_id, estoque_minimo, ativo;

-- ──────────────────────────────────────────────────────────
-- 9. VIEW: alertas v2 (baseado em disponivel)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_estoque_comercial_alerta_v2 AS
SELECT
  *,
  CASE
    WHEN disponivel < 0              THEN 'negativo'
    WHEN disponivel = 0              THEN 'zerado'
    WHEN disponivel < estoque_minimo THEN 'abaixo_minimo'
    WHEN disponivel = estoque_minimo THEN 'no_minimo'
    ELSE                                  'ok'
  END AS alerta
FROM vw_saldo_estoque_comercial_consolidado;

-- ──────────────────────────────────────────────────────────
-- 10. GRANTS
-- ──────────────────────────────────────────────────────────
-- Reservas
GRANT SELECT, INSERT, UPDATE ON reservas_estoque_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE reservas_estoque_comercial_id_seq TO authenticated;

-- Transferencias
GRANT SELECT, INSERT, UPDATE ON transferencias_estoque_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE transferencias_estoque_comercial_id_seq TO authenticated;

-- Inventario
GRANT SELECT, INSERT, UPDATE ON inventarios_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE inventarios_comercial_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE ON itens_inventario_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE itens_inventario_comercial_id_seq TO authenticated;

-- Views
GRANT SELECT ON vw_saldo_estoque_comercial_v2 TO authenticated;
GRANT SELECT ON vw_saldo_estoque_comercial_consolidado TO authenticated;
GRANT SELECT ON vw_estoque_comercial_alerta_v2 TO authenticated;

-- Locais (INSERT para admin criar novos)
GRANT INSERT, UPDATE ON locais_estoque TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE locais_estoque_id_seq TO authenticated;
