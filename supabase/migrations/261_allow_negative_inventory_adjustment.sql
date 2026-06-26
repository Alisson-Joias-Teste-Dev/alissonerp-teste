-- Inventario fisico e a fonte de verdade do estoque.
-- Ajustes de inventario DEVEM poder corrigir para zero ou negativo,
-- pois o objetivo e justamente encontrar e corrigir furos de estoque.

CREATE OR REPLACE FUNCTION alissonerp.fn_prevent_negative_sle()
RETURNS TRIGGER AS 208
BEGIN
  -- Ajustes de inventario fisico: bypass da validacao de negativo
  -- O inventario E o mecanismo de correcao — bloquear derrota o proposito
  IF NEW.voucher_type = 'inventario' THEN
    RETURN NEW;
  END IF;

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
208 LANGUAGE plpgsql;
