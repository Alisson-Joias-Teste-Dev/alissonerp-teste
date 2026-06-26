-- ============================================================
-- Migration 160 — Evoluir movimentacoes_estoque_comercial + Seed de public.estoque
--
-- Parte 1: adiciona colunas que as APIs já esperam mas ainda não existem
-- Parte 2: importa saldo atual de public.estoque como movimento inicial
--   estoque_loja   → local_estoque_id = 2 (Loja)
--   saldo restante → local_estoque_id = 1 (Fábrica), se > 0
--   Pula produtos que já têm movimentação
-- ============================================================

-- ── Parte 1: colunas faltantes ────────────────────────────────────────────────

ALTER TABLE alissonerp.movimentacoes_estoque_comercial
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'efetivado'
                                            CHECK (status IN ('efetivado','estornado')),
  ADD COLUMN IF NOT EXISTS local_estoque_id INTEGER      REFERENCES alissonerp.locais_estoque(id),
  ADD COLUMN IF NOT EXISTS estorno_de_id    INTEGER      REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  ADD COLUMN IF NOT EXISTS estornado_por_id INTEGER      REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  ADD COLUMN IF NOT EXISTS ordem_id         INTEGER,
  ADD COLUMN IF NOT EXISTS protocolo_id     INTEGER;

CREATE INDEX IF NOT EXISTS idx_mov_ec_local
  ON alissonerp.movimentacoes_estoque_comercial (local_estoque_id);

CREATE INDEX IF NOT EXISTS idx_mov_ec_status
  ON alissonerp.movimentacoes_estoque_comercial (status);

-- ── Parte 2: upsert config ────────────────────────────────────────────────────

INSERT INTO alissonerp.estoque_comercial_config (produto_id, estoque_minimo, ativo)
SELECT DISTINCT p.id_produto, 0, true
FROM public.estoque e
JOIN public.produtos p ON p.sku = e.sku
WHERE COALESCE(e.saldo, 0) > 0
  AND p.id_produto IS NOT NULL
ON CONFLICT (produto_id) DO NOTHING;

-- ── Parte 3: movimentos iniciais ──────────────────────────────────────────────

WITH agg AS (
  SELECT
    p.id_produto,
    SUM(COALESCE(e.estoque_loja, e.saldo))::integer                            AS saldo_loja,
    GREATEST(0, SUM(e.saldo) - SUM(COALESCE(e.estoque_loja, 0)))::integer      AS saldo_fabrica
  FROM public.estoque e
  JOIN public.produtos p ON p.sku = e.sku
  WHERE COALESCE(e.saldo, 0) > 0
    AND p.id_produto IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM alissonerp.movimentacoes_estoque_comercial m
      WHERE m.produto_id = p.id_produto
    )
  GROUP BY p.id_produto
),
movimentos AS (
  SELECT id_produto AS produto_id, 2 AS local_estoque_id, saldo_loja    AS quantidade FROM agg WHERE saldo_loja    > 0
  UNION ALL
  SELECT id_produto AS produto_id, 1 AS local_estoque_id, saldo_fabrica AS quantidade FROM agg WHERE saldo_fabrica > 0
)
INSERT INTO alissonerp.movimentacoes_estoque_comercial
  (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao)
SELECT
  produto_id,
  'entrada',
  quantidade,
  'ajuste_entrada',
  local_estoque_id,
  'efetivado',
  'Saldo inicial importado de public.estoque — ' || CURRENT_DATE::text
FROM movimentos;
