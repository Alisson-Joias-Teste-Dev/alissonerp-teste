-- Migration 176: tabelas de estoque comercial (produtos de prateleira/loja)
-- Controla reservas e movimentações de produtos físicos do estoque da loja.
-- Triggers já existem em vendas_erp e itens_venda_erp — só faltavam as tabelas.

-- ─── CONFIG ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.estoque_comercial_config (
  produto_id   BIGINT       PRIMARY KEY REFERENCES public.produtos(id_produto) ON DELETE CASCADE,
  ativo        BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_update_estoque_comercial_config_ts ON alissonerp.estoque_comercial_config;
CREATE TRIGGER trg_update_estoque_comercial_config_ts
  BEFORE UPDATE ON alissonerp.estoque_comercial_config
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_update_estoque_comercial_config_ts();

-- ─── MOVIMENTAÇÕES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.movimentacoes_estoque_comercial (
  id               BIGSERIAL    PRIMARY KEY,
  produto_id       BIGINT       NOT NULL REFERENCES public.produtos(id_produto),
  tipo             TEXT         NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  quantidade       NUMERIC      NOT NULL CHECK (quantidade > 0),
  motivo           TEXT         NOT NULL,  -- venda, cancelamento, estorno, devolucao, ajuste, inventario
  referencia_id    BIGINT,
  referencia_tipo  TEXT,                   -- vendas_erp, etc.
  local_estoque_id BIGINT,
  status           TEXT         NOT NULL DEFAULT 'efetivado' CHECK (status IN ('efetivado', 'estornado')),
  estorno_de_id    BIGINT       REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  estornado_por_id BIGINT       REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  observacao       TEXT,
  created_by       UUID         REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mec_produto    ON alissonerp.movimentacoes_estoque_comercial (produto_id, status);
CREATE INDEX IF NOT EXISTS idx_mec_referencia ON alissonerp.movimentacoes_estoque_comercial (referencia_id, referencia_tipo);

-- ─── RESERVAS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.reservas_estoque_comercial (
  id               BIGSERIAL    PRIMARY KEY,
  produto_id       BIGINT       NOT NULL REFERENCES public.produtos(id_produto),
  venda_id         BIGINT       NOT NULL REFERENCES alissonerp.vendas_erp(id) ON DELETE CASCADE,
  item_venda_id    BIGINT       REFERENCES alissonerp.itens_venda_erp(id)     ON DELETE CASCADE,
  quantidade       NUMERIC      NOT NULL CHECK (quantidade > 0),
  local_estoque_id BIGINT,
  status           TEXT         NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'cancelado', 'efetivado')),
  movimento_id     BIGINT       REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  cancelado_em     TIMESTAMPTZ,
  efetivado_em     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_venda   ON alissonerp.reservas_estoque_comercial (venda_id, status);
CREATE INDEX IF NOT EXISTS idx_rec_produto ON alissonerp.reservas_estoque_comercial (produto_id, status);

-- ─── VIEW SALDO ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_saldo_estoque_comercial AS
SELECT
  m.produto_id,
  p.nome,
  p.sku,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE 0 END) AS total_entradas,
  SUM(CASE WHEN m.tipo = 'saida'   THEN m.quantidade ELSE 0 END) AS total_saidas,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) AS saldo_atual,
  COALESCE((
    SELECT SUM(r.quantidade) FROM alissonerp.reservas_estoque_comercial r
    WHERE r.produto_id = m.produto_id AND r.status = 'ativo'
  ), 0) AS reservado,
  SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)
    - COALESCE((
        SELECT SUM(r.quantidade) FROM alissonerp.reservas_estoque_comercial r
        WHERE r.produto_id = m.produto_id AND r.status = 'ativo'
      ), 0) AS disponivel
FROM alissonerp.movimentacoes_estoque_comercial m
JOIN public.produtos p ON p.id_produto = m.produto_id
WHERE m.status = 'efetivado'
GROUP BY m.produto_id, p.nome, p.sku;
