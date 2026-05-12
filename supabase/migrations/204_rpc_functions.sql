-- Migration 204: RPC Functions para Stock Ledger

-- Consultar saldo de um item em um warehouse especifico
CREATE OR REPLACE FUNCTION alissonerp.get_sle_balance(
  p_item_id      BIGINT,
  p_item_type    TEXT DEFAULT 'produto',
  p_warehouse_id INTEGER DEFAULT NULL
)
RETURNS NUMERIC(16,4) AS $$
BEGIN
  RETURN (
    SELECT COALESCE(SUM(actual_qty), 0)::NUMERIC(16,4)
    FROM alissonerp.stock_ledger_entry
    WHERE item_id = p_item_id
      AND item_type = p_item_type
      AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
      AND is_cancelled = false
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Saldo consolidado por warehouse
CREATE OR REPLACE FUNCTION alissonerp.get_sle_balance_all(
  p_item_id   BIGINT,
  p_item_type TEXT DEFAULT 'produto'
)
RETURNS TABLE(
  warehouse_id   INTEGER,
  warehouse_nome TEXT,
  saldo_fisico   NUMERIC(16,4)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sle.warehouse_id,
    l.nome,
    COALESCE(SUM(sle.actual_qty), 0)::NUMERIC(16,4)
  FROM alissonerp.stock_ledger_entry sle
  JOIN alissonerp.locais_estoque l ON l.id = sle.warehouse_id
  WHERE sle.item_id = p_item_id
    AND sle.item_type = p_item_type
    AND sle.is_cancelled = false
  GROUP BY sle.warehouse_id, l.nome
  ORDER BY l.nome;
END;
$$ LANGUAGE plpgsql STABLE;

-- Relatorio de auditoria para diretoria
CREATE OR REPLACE FUNCTION alissonerp.get_stock_ledger_report(
  p_item_id      BIGINT DEFAULT NULL,
  p_warehouse_id INTEGER DEFAULT NULL,
  p_from_date    DATE DEFAULT NULL,
  p_to_date      DATE DEFAULT NULL
)
RETURNS TABLE(
  id              BIGINT,
  item_id         BIGINT,
  item_nome       TEXT,
  item_sku        TEXT,
  warehouse_nome  TEXT,
  actual_qty      NUMERIC(12,4),
  qty_after       NUMERIC(16,4),
  voucher_type    TEXT,
  voucher_id      INTEGER,
  posting_date    DATE,
  created_by_email TEXT,
  is_cancelled    BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sle.id,
    sle.item_id,
    COALESCE(p.nome, i.nome)::TEXT AS item_nome,
    COALESCE(p.sku, i.sku)::TEXT AS item_sku,
    l.nome::TEXT AS warehouse_nome,
    sle.actual_qty,
    sle.qty_after,
    sle.voucher_type,
    sle.voucher_id,
    sle.posting_date,
    u.email::TEXT AS created_by_email,
    sle.is_cancelled
  FROM alissonerp.stock_ledger_entry sle
  JOIN alissonerp.locais_estoque l ON l.id = sle.warehouse_id
  LEFT JOIN public.produtos p ON sle.item_type = 'produto' AND p.id_produto = sle.item_id
  LEFT JOIN alissonerp.insumos i ON sle.item_type = 'insumo' AND i.id = sle.item_id
  LEFT JOIN auth.users u ON u.id = sle.created_by
  WHERE (p_item_id IS NULL OR sle.item_id = p_item_id)
    AND (p_warehouse_id IS NULL OR sle.warehouse_id = p_warehouse_id)
    AND (p_from_date IS NULL OR sle.posting_date >= p_from_date)
    AND (p_to_date IS NULL OR sle.posting_date <= p_to_date)
  ORDER BY sle.posting_date, sle.posting_time, sle.id;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION alissonerp.get_sle_balance TO authenticated, anon;
GRANT EXECUTE ON FUNCTION alissonerp.get_sle_balance_all TO authenticated, anon;
GRANT EXECUTE ON FUNCTION alissonerp.get_stock_ledger_report TO authenticated;
