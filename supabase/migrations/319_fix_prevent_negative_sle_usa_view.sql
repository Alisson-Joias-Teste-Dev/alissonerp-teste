-- migration 319: fix fn_prevent_negative_sle — lê da view em vez do SLE
--
-- PROBLEMA RAIZ: a trava de estoque negativo lia do stock_ledger_entry (SLE).
-- O SLE pode divergir da tabela movimentacoes_estoque_comercial (que é o que
-- a tela mostra), causando STOCK_NEGATIVE mesmo com saldo visível na tela.
-- Causa mais comum: ajuste manual gravado com quantidade diferente nos dois lados.
--
-- CORREÇÃO: a trava passa a ler da mesma fonte que a tela usa.
-- O SLE continua sendo populado automaticamente (via trg_mirror_movimento_to_sle)
-- como log de auditoria — mas deixa de ser fonte de verdade para o bloqueio.
--
-- IMPACTO: elimina definitivamente o falso-positivo STOCK_NEGATIVE em conversões,
-- entregas e qualquer operação onde SLE e view estivessem fora de sincronia.

-- Backup implícito: a versão anterior está preservada no histórico de migrations (202).

CREATE OR REPLACE FUNCTION alissonerp.fn_prevent_negative_sle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  saldo_atual NUMERIC;
BEGIN
  -- inventario e transferencia não alteram o saldo líquido — sempre passam
  IF NEW.voucher_type IN ('inventario', 'transferencia') THEN
    RETURN NEW;
  END IF;

  -- Lê o saldo físico da mesma fonte que a tela (movimentacoes_estoque_comercial).
  -- Garante que a trava nunca diverge do número visível ao usuário.
  SELECT COALESCE(
    SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END), 0
  ) INTO saldo_atual
  FROM alissonerp.movimentacoes_estoque_comercial
  WHERE produto_id = NEW.item_id
    AND local_estoque_id = NEW.warehouse_id
    AND status = 'efetivado';

  IF saldo_atual + NEW.actual_qty < 0 THEN
    RAISE EXCEPTION 'STOCK_NEGATIVE: Saldo insuficiente no almoxarifado. Item=%, Warehouse=%',
      NEW.item_id, NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$;
