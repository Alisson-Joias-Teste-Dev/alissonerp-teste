-- Migration 254: Stock ledger mirror para motivos de conversão SKU
-- Adiciona os novos motivos 'conversao_sku_*' no trigger mirror para
-- stock_ledger_entry, garantindo que a constraint chk_voucher_for_outgoing
-- não seja violada.

-- 1. Atualizar trigger mirror com novos motivos
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
      WHEN NEW.motivo IN ('reservado_conversao','virou_peso') THEN 'ordem_producao'
      WHEN NEW.motivo = 'recusado_conversao' THEN 'reconciliacao'
      WHEN NEW.motivo IN ('conversao_sku_ida','conversao_sku_volta') THEN 'transferencia'
      WHEN NEW.motivo IN ('conversao_sku_consumo','conversao_sku_producao') THEN 'ordem_producao'
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
