-- ============================================================
-- Migration 235: Adicionar UNIQUE constraint em itens_venda_erp
--                Previne duplicatas de (venda_id, produto_id, sku)
--
-- PREREQUISITO: Duplicatas existentes devem ser removidas antes.
-- Execute scripts/fix_duplicate_items.mjs primeiro.
--
-- O indice parcial com COALESCE(sku, '') garante que mesmo
-- itens sem SKU nao possam ser duplicados na mesma venda.
-- ============================================================

-- Verifica se nao ha duplicatas antes de criar o indice
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) - COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, '')))
  INTO dup_count
  FROM alissonerp.itens_venda_erp
  WHERE produto_id IS NOT NULL;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % itens duplicados em itens_venda_erp. Execute scripts/fix_duplicate_items.mjs antes desta migration.', dup_count;
  END IF;
END $$;

-- UNIQUE parcial em (venda_id, produto_id, sku)
-- Usa COALESCE porque NULL != NULL em UNIQUE constraints
CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_venda_erp_prod_sku
  ON alissonerp.itens_venda_erp (venda_id, produto_id, COALESCE(sku, ''))
  WHERE produto_id IS NOT NULL;

-- UNIQUE parcial em (public_venda_id) para vendas_erp
-- Garante idempotencia do trigger fn_sync_venda_from_public
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_erp_public_venda_id
  ON alissonerp.vendas_erp (public_venda_id)
  WHERE public_venda_id IS NOT NULL;
