-- ============================================================
-- Migration 107 — Estoque Comercial
-- Controle de estoque de produtos acabados para o módulo de vendas
-- ============================================================

-- 1. Tabela de configuração por produto
CREATE TABLE IF NOT EXISTS alissonerp.estoque_comercial_config (
  id                SERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL UNIQUE,          -- FK → public.produtos.id_produto
  estoque_minimo    INTEGER NOT NULL DEFAULT 0,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Movimentações de estoque comercial
CREATE TABLE IF NOT EXISTS alissonerp.movimentacoes_estoque_comercial (
  id                SERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL,                 -- FK → public.produtos.id_produto
  tipo              VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade        INTEGER NOT NULL CHECK (quantidade > 0),
  motivo            VARCHAR(50) NOT NULL,
  -- motivo: ajuste_entrada | ajuste_saida | venda | devolucao | producao | inventario
  referencia_id     INTEGER,                         -- ex: vendas_erp.id quando tipo=venda
  referencia_tipo   VARCHAR(30),                     -- ex: 'venda_erp'
  observacao        TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_mov_ec_produto_id ON alissonerp.movimentacoes_estoque_comercial (produto_id);
CREATE INDEX IF NOT EXISTS idx_mov_ec_created_at ON alissonerp.movimentacoes_estoque_comercial (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mov_ec_referencia  ON alissonerp.movimentacoes_estoque_comercial (referencia_tipo, referencia_id);

-- 4. Trigger updated_at na config
CREATE OR REPLACE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_estoque_comercial_config_ts ON alissonerp.estoque_comercial_config;
CREATE TRIGGER trg_update_estoque_comercial_config_ts
  BEFORE UPDATE ON alissonerp.estoque_comercial_config
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts();

-- 5. View: saldo atual por produto
CREATE OR REPLACE VIEW alissonerp.vw_saldo_estoque_comercial AS
SELECT
  p.id_produto                                          AS produto_id,
  p.nome                                                AS nome_produto,
  p.sku                                                 AS sku,
  COALESCE(p.categoria, '')                             AS categoria,
  COALESCE(
    SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END),
    0
  )::INTEGER                                            AS saldo,
  COALESCE(cfg.estoque_minimo, 0)                       AS estoque_minimo,
  COALESCE(cfg.ativo, false)                            AS ativo,
  cfg.id                                                AS config_id,
  COUNT(m.id)::INTEGER                                  AS total_movimentacoes
FROM public.produtos p
LEFT JOIN alissonerp.estoque_comercial_config cfg ON cfg.produto_id = p.id_produto
LEFT JOIN alissonerp.movimentacoes_estoque_comercial m ON m.produto_id = p.id_produto
WHERE cfg.ativo = true
GROUP BY p.id_produto, p.nome, p.sku, p.categoria, cfg.estoque_minimo, cfg.ativo, cfg.id;

-- 6. View: estoque com alertas
CREATE OR REPLACE VIEW alissonerp.vw_estoque_comercial_com_alerta AS
SELECT
  *,
  CASE
    WHEN saldo = 0            THEN 'zerado'
    WHEN saldo < estoque_minimo THEN 'abaixo_minimo'
    WHEN saldo = estoque_minimo THEN 'no_minimo'
    ELSE                           'ok'
  END AS alerta
FROM alissonerp.vw_saldo_estoque_comercial;

-- 7. Grants
GRANT SELECT, INSERT, UPDATE ON alissonerp.estoque_comercial_config          TO authenticated;
GRANT SELECT, INSERT          ON alissonerp.movimentacoes_estoque_comercial   TO authenticated;
GRANT SELECT ON alissonerp.vw_saldo_estoque_comercial                        TO authenticated;
GRANT SELECT ON alissonerp.vw_estoque_comercial_com_alerta                   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.estoque_comercial_config_id_seq          TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.movimentacoes_estoque_comercial_id_seq   TO authenticated;
