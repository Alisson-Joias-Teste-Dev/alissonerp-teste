-- Migration 202: Stock Ledger Entry - Livro Razao Imutavel
-- FabricaAj — Modulo de Estoque Blindado v1.0
-- Garante: partidas dobradas, qty_after, imutabilidade, rastreabilidade

CREATE TABLE IF NOT EXISTS alissonerp.stock_ledger_entry (
  id                BIGSERIAL PRIMARY KEY,
  item_id           BIGINT    NOT NULL,
  item_type         TEXT      NOT NULL CHECK (item_type IN ('produto', 'insumo')),
  warehouse_id      INTEGER   NOT NULL REFERENCES alissonerp.locais_estoque(id),

  actual_qty        NUMERIC(12,4) NOT NULL,
  qty_after         NUMERIC(16,4) NOT NULL DEFAULT 0,

  valuation_rate    NUMERIC(16,4),
  stock_value       NUMERIC(20,4),
  stock_value_diff  NUMERIC(20,4),

  voucher_type      TEXT NOT NULL DEFAULT 'manual',
  voucher_id        INTEGER,
  voucher_detail_id INTEGER,

  weight_grams      NUMERIC(12,6),
  purity            TEXT,
  gold_color        TEXT,
  stone_carat       NUMERIC(10,4),
  obs               TEXT,

  is_cancelled      BOOLEAN   NOT NULL DEFAULT false,
  cancelled_by_id   BIGINT    REFERENCES alissonerp.stock_ledger_entry(id),

  posting_date      DATE      NOT NULL DEFAULT CURRENT_DATE,
  posting_time      TIME      NOT NULL DEFAULT CURRENT_TIME,
  batch_id          BIGINT,
  created_by        UUID      NOT NULL,
  approved_by       UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE alissonerp.stock_ledger_entry ADD CONSTRAINT chk_voucher_for_outgoing
  CHECK (
    actual_qty >= 0
    OR (voucher_type != 'manual' AND voucher_id IS NOT NULL)
  );

ALTER TABLE alissonerp.stock_ledger_entry ADD CONSTRAINT chk_voucher_type_valid
  CHECK (voucher_type IN (
    'venda','ordem_producao','transferencia','inventario',
    'reconciliacao','compra','devolucao','quebra','producao_auto',
    'ajuste_entrada','ajuste_saida','sangria','manual'
  ));

CREATE INDEX IF NOT EXISTS idx_sle_item_warehouse
  ON alissonerp.stock_ledger_entry(item_id, item_type, warehouse_id, is_cancelled)
  WHERE NOT is_cancelled;

CREATE INDEX IF NOT EXISTS idx_sle_item_date
  ON alissonerp.stock_ledger_entry(item_id, warehouse_id, posting_date, posting_time, id);

CREATE INDEX IF NOT EXISTS idx_sle_voucher
  ON alissonerp.stock_ledger_entry(voucher_type, voucher_id);

CREATE OR REPLACE FUNCTION alissonerp.fn_calc_qty_after_sle()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_qty NUMERIC(16,4);
BEGIN
  SELECT qty_after INTO v_prev_qty
  FROM alissonerp.stock_ledger_entry
  WHERE item_id = NEW.item_id
    AND item_type = NEW.item_type
    AND warehouse_id = NEW.warehouse_id
    AND is_cancelled = false
    AND id != NEW.id
  ORDER BY posting_date DESC, posting_time DESC, id DESC
  LIMIT 1;
  NEW.qty_after := COALESCE(v_prev_qty, 0) + NEW.actual_qty;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_qty_after_sle ON alissonerp.stock_ledger_entry;
CREATE TRIGGER trg_calc_qty_after_sle
  BEFORE INSERT ON alissonerp.stock_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_calc_qty_after_sle();

CREATE OR REPLACE FUNCTION alissonerp.fn_repost_future_sle()
RETURNS TRIGGER AS $$
DECLARE
  v_running NUMERIC(16,4);
  r RECORD;
BEGIN
  SELECT qty_after INTO v_running
  FROM alissonerp.stock_ledger_entry
  WHERE item_id = NEW.item_id
    AND item_type = NEW.item_type
    AND warehouse_id = NEW.warehouse_id
    AND is_cancelled = false
  ORDER BY posting_date DESC, posting_time DESC, id DESC
  LIMIT 1;
  IF v_running IS NULL THEN v_running := NEW.actual_qty; END IF;
  FOR r IN (
    SELECT id, actual_qty FROM alissonerp.stock_ledger_entry
    WHERE item_id = NEW.item_id
      AND item_type = NEW.item_type
      AND warehouse_id = NEW.warehouse_id
      AND is_cancelled = false
      AND (posting_date > NEW.posting_date
           OR (posting_date = NEW.posting_date AND posting_time > NEW.posting_time)
           OR (posting_date = NEW.posting_date AND posting_time = NEW.posting_time AND id > NEW.id))
    ORDER BY posting_date, posting_time, id
    FOR UPDATE
  ) LOOP
    v_running := v_running + r.actual_qty;
    UPDATE alissonerp.stock_ledger_entry SET qty_after = v_running WHERE id = r.id;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repost_future_sle ON alissonerp.stock_ledger_entry;
CREATE TRIGGER trg_repost_future_sle
  AFTER INSERT ON alissonerp.stock_ledger_entry
  FOR EACH ROW
  WHEN (NOT NEW.is_cancelled)
  EXECUTE FUNCTION alissonerp.fn_repost_future_sle();

CREATE OR REPLACE FUNCTION alissonerp.fn_prevent_negative_sle()
RETURNS TRIGGER AS $$BEGIN
  IF (SELECT COALESCE(SUM(actual_qty), 0) + NEW.actual_qty
      FROM alissonerp.stock_ledger_entry
      WHERE item_id = NEW.item_id
        AND item_type = NEW.item_type
        AND warehouse_id = NEW.warehouse_id
        AND is_cancelled = false) < 0
  THEN
    RAISE EXCEPTION 'STOCK_NEGATIVE: Saldo insuficiente no almoxarifado. Item=%, Warehouse=%',
      NEW.item_id, NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_negative_sle ON alissonerp.stock_ledger_entry;
CREATE TRIGGER trg_prevent_negative_sle
  BEFORE INSERT ON alissonerp.stock_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_prevent_negative_sle();

CREATE OR REPLACE FUNCTION alissonerp.fn_prevent_sle_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'STOCK_IMMUTABLE: Nao pode deletar. Use estorno ou reconciliacao.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_sle_delete ON alissonerp.stock_ledger_entry;
CREATE TRIGGER trg_prevent_sle_delete
  BEFORE DELETE ON alissonerp.stock_ledger_entry
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_prevent_sle_delete();

CREATE OR REPLACE FUNCTION alissonerp.fn_mirror_movimento_to_sle()
RETURNS TRIGGER AS $$
DECLARE
  v_sle_id BIGINT;
BEGIN
  INSERT INTO alissonerp.stock_ledger_entry (
    item_id, item_type, warehouse_id,
    actual_qty,
    voucher_type, voucher_id,
    obs, created_by, posting_date, posting_time
  ) VALUES (
    NEW.produto_id, 'produto', NEW.local_estoque_id,
    CASE WHEN NEW.tipo = 'entrada' THEN NEW.quantidade ELSE -NEW.quantidade END,
    CASE
      WHEN NEW.motivo = 'venda' THEN 'venda'
      WHEN NEW.motivo IN ('transferencia_saida','transferencia_entrada') THEN 'transferencia'
      WHEN NEW.motivo = 'devolucao' THEN 'devolucao'
      WHEN NEW.motivo = 'inventario' THEN 'inventario'
      WHEN NEW.motivo = 'estorno' THEN 'reconciliacao'
      WHEN NEW.motivo IN ('ajuste_entrada','ajuste_saida') THEN 'ajuste_entrada'
      WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
      ELSE 'manual'
    END,
    NEW.referencia_id,
    NEW.observacao,
    COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    NEW.created_at::DATE,
    NEW.created_at::TIME
  ) RETURNING id INTO v_sle_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mirror_movimento_to_sle ON alissonerp.movimentacoes_estoque_comercial;
CREATE TRIGGER trg_mirror_movimento_to_sle
  AFTER INSERT ON alissonerp.movimentacoes_estoque_comercial
  FOR EACH ROW
  WHEN (NEW.status = 'efetivado')
  EXECUTE FUNCTION alissonerp.fn_mirror_movimento_to_sle();

REVOKE DELETE ON alissonerp.stock_ledger_entry FROM authenticated, anon, service_role;
REVOKE UPDATE ON alissonerp.stock_ledger_entry FROM authenticated, anon, service_role;

GRANT SELECT, INSERT ON alissonerp.stock_ledger_entry TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.stock_ledger_entry_id_seq TO authenticated;
GRANT SELECT ON alissonerp.stock_ledger_entry TO anon;
