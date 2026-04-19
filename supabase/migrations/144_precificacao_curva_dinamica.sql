-- ============================================================
-- Migration 144 — Curva Dinamica de Precificacao
-- v2.24.0 — Substitui markup fixo por interpolacao linear
--
-- Mudancas:
--   1. Nova tabela alissonerp.curva_config (singleton id=1)
--   2. Nova tabela alissonerp.curva_categorias (faixas de peso)
--   3. Novas colunas em public.produtos: comissao_pct, max_desconto_pct
--   4. Seed inicial reproduz curva atual (5.0x -> 2.4x)
--
-- NOTA: Nao mexe em triggers legados de public.produtos nem
-- em public.categoria_precificacao (fica como legado).
-- ============================================================

SET search_path TO alissonerp;

-- ─── 1. Tabela curva_config (singleton) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.curva_config (
  id                    SMALLINT PRIMARY KEY CHECK (id = 1),
  start_mkp             NUMERIC(6,3)  NOT NULL DEFAULT 5.000,
  start_commission      NUMERIC(6,3)  NOT NULL DEFAULT 8.000,
  gold_cost_percentage  NUMERIC(6,3)  NOT NULL DEFAULT 100.000,
  sucata_compra_min_pct NUMERIC(6,3)  NOT NULL DEFAULT 80.000,
  sucata_compra_max_pct NUMERIC(6,3)  NOT NULL DEFAULT 85.000,
  arredondamento        VARCHAR(20)   NOT NULL DEFAULT 'dezena'
    CHECK (arredondamento IN ('dezena','unidade','centena')),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by            UUID
);

COMMENT ON TABLE  alissonerp.curva_config IS 'Configuracao global da curva de precificacao (singleton id=1)';
COMMENT ON COLUMN alissonerp.curva_config.start_mkp IS 'Markup inicial (peso = 0.1g). Ex: 5.000';
COMMENT ON COLUMN alissonerp.curva_config.start_commission IS 'Comissao inicial em % (peso = 0.1g). Ex: 8.000';
COMMENT ON COLUMN alissonerp.curva_config.gold_cost_percentage IS '%% da cotacao que entra como custo do ouro (100 = 100%%)';
COMMENT ON COLUMN alissonerp.curva_config.sucata_compra_min_pct IS '%% minimo da cotacao pago na compra de sucata';
COMMENT ON COLUMN alissonerp.curva_config.sucata_compra_max_pct IS '%% maximo da cotacao pago na compra de sucata';
COMMENT ON COLUMN alissonerp.curva_config.arredondamento IS 'dezena | unidade | centena';

-- Seed config
INSERT INTO alissonerp.curva_config (id, start_mkp, start_commission, gold_cost_percentage, sucata_compra_min_pct, sucata_compra_max_pct, arredondamento)
VALUES (1, 5.000, 8.000, 100.000, 80.000, 85.000, 'dezena')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Tabela curva_categorias ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.curva_categorias (
  id              SERIAL PRIMARY KEY,
  nome            VARCHAR(60)   NOT NULL,
  max_weight      NUMERIC(10,3) NOT NULL CHECK (max_weight > 0),
  variation       NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (variation >= 0),
  comm_variation  NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (comm_variation >= 0),
  max_discount    NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (max_discount >= 0 AND max_discount <= 100),
  ativo           BOOLEAN       NOT NULL DEFAULT true,
  ordem           INT           NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curva_categorias_ordem
  ON alissonerp.curva_categorias(ordem);

CREATE INDEX IF NOT EXISTS idx_curva_categorias_ativo_peso
  ON alissonerp.curva_categorias(ativo, max_weight)
  WHERE ativo = true;

COMMENT ON TABLE  alissonerp.curva_categorias IS 'Faixas de peso da curva de precificacao. Interpolacao linear entre pontos.';
COMMENT ON COLUMN alissonerp.curva_categorias.max_weight IS 'Peso maximo da faixa em gramas (limite superior)';
COMMENT ON COLUMN alissonerp.curva_categorias.variation IS 'Quanto reduz o MKP em relacao ao degrau anterior';
COMMENT ON COLUMN alissonerp.curva_categorias.comm_variation IS 'Quanto reduz a comissao em relacao ao degrau anterior';
COMMENT ON COLUMN alissonerp.curva_categorias.max_discount IS '%% maximo de desconto permitido para produtos desta faixa';
COMMENT ON COLUMN alissonerp.curva_categorias.ordem IS 'Ordem de aplicacao (sequencial por peso crescente)';

-- Seed de categorias: reproduz curva atual (5.0x -> 2.4x)
-- Ordem   MaxWeight   Variation   CommVariation   MaxDiscount   Target(MKP)
--   1        0.5         0.0           0.0            15           5.0
--   2        1.0         1.1           0.5            15           3.9
--   3        2.0         0.3           0.5            15           3.6
--   4        3.0         0.2           0.5            12           3.4
--   5        4.0         0.2           0.5            12           3.2
--   6       10.0         0.2           0.5            10           3.0
--   7       20.0         0.2           0.5            10           2.8
--   8       40.0         0.2           0.5             8           2.6
--   9      100.0         0.2           0.5             5           2.4
INSERT INTO alissonerp.curva_categorias (nome, max_weight, variation, comm_variation, max_discount, ordem) VALUES
  ('Leves 1',   0.5,   0.0, 0.0, 15, 1),
  ('Leves 2',   1.0,   1.1, 0.5, 15, 2),
  ('Leves 3',   2.0,   0.3, 0.5, 15, 3),
  ('Leves 4',   3.0,   0.2, 0.5, 12, 4),
  ('Leves 5',   4.0,   0.2, 0.5, 12, 5),
  ('Medias 1', 10.0,   0.2, 0.5, 10, 6),
  ('Medias 2', 20.0,   0.2, 0.5, 10, 7),
  ('Pesadas',  40.0,   0.2, 0.5,  8, 8),
  ('Atacado', 100.0,   0.2, 0.5,  5, 9)
ON CONFLICT DO NOTHING;

-- ─── 3. Tabela paralela para comissao e max_desconto por produto ─────────────
-- NOTA: public.produtos e owned pelo usuario directus; nao podemos ALTER TABLE.
-- Criamos tabela em alissonerp que mapeia produto_id -> comissao + max_desconto.
CREATE TABLE IF NOT EXISTS alissonerp.produto_curva_aplicada (
  produto_id       BIGINT PRIMARY KEY,
  comissao_pct     NUMERIC(6,3),
  max_desconto_pct NUMERIC(5,2),
  markup_aplicado  NUMERIC(10,4),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produto_curva_aplicada_updated
  ON alissonerp.produto_curva_aplicada(updated_at DESC);

COMMENT ON TABLE alissonerp.produto_curva_aplicada IS 'Comissao, max desconto e markup aplicados em cada produto pela curva dinamica. Populada por /api/precificacao/curva/aplicar.';
COMMENT ON COLUMN alissonerp.produto_curva_aplicada.produto_id IS 'FK para public.produtos.id_produto';
COMMENT ON COLUMN alissonerp.produto_curva_aplicada.comissao_pct IS 'Comissao %% calculada pela curva';
COMMENT ON COLUMN alissonerp.produto_curva_aplicada.max_desconto_pct IS '%% maximo de desconto permitido em venda/orcamento';
COMMENT ON COLUMN alissonerp.produto_curva_aplicada.markup_aplicado IS 'Markup calculado pela curva no momento da aplicacao (auditoria)';

-- ─── 4. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.curva_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.curva_categorias TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.curva_categorias_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_curva_aplicada TO authenticated;

-- ─── 5. Trigger updated_at automatico ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_curva_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_curva_config_updated_at ON alissonerp.curva_config;
CREATE TRIGGER trg_curva_config_updated_at
  BEFORE UPDATE ON alissonerp.curva_config
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_curva_touch_updated_at();

DROP TRIGGER IF EXISTS trg_curva_categorias_updated_at ON alissonerp.curva_categorias;
CREATE TRIGGER trg_curva_categorias_updated_at
  BEFORE UPDATE ON alissonerp.curva_categorias
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_curva_touch_updated_at();
