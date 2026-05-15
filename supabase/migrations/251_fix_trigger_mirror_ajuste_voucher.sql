-- Migration 251: Corrige trigger fn_mirror_movimento_to_sle()
-- Problemas corrigidos:
-- 1. 'ajuste_entrada' e 'ajuste_saida' ambos mapeavam para 'ajuste_entrada'
--    (agora cada um mapeia para seu próprio voucher_type)
-- 2. voucher_id ficava NULL para movimentações manuais sem referencia_id,
--    violando a constraint chk_voucher_for_outgoing (que exige
--    voucher_id IS NOT NULL para movimentos de saída com tipo não-manual)
--    → fallback para NEW.id (a própria movimentação serve como documento)

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
      WHEN NEW.motivo = 'ajuste_entrada' THEN 'ajuste_entrada'
      WHEN NEW.motivo = 'ajuste_saida' THEN 'ajuste_saida'
      WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
      WHEN NEW.motivo IN ('reservado_conversao','virou_peso') THEN 'ordem_producao'
      WHEN NEW.motivo = 'recusado_conversao' THEN 'reconciliacao'
      ELSE 'manual'
    END,
    COALESCE(NEW.referencia_id, NEW.id),
    NEW.observacao,
    COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    NEW.created_at::DATE,
    NEW.created_at::TIME
  ) RETURNING id INTO v_sle_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
