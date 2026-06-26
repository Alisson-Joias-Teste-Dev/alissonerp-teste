-- Migration 249: Corrige fn_concluir_protocolo_conversao para tratar
-- conversoes criadas com formato antigo (movimento_reserva_id) e novo (reserva_id).
-- Também atualiza fn_prevent_negative_sle para considerar reservas ativas.

-- 1. Corrigir fn_concluir_protocolo_conversao
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao()
RETURNS TRIGGER AS $$
DECLARE
  v_conversao    RECORD;
  v_ordem        RECORD;
  v_item         RECORD;
  v_mov_baixa    BIGINT;
  v_insumo_id    INTEGER;
  v_local_loja   INTEGER := 2;
  v_local_fabrica INTEGER := 1;
BEGIN
  IF NEW.etapas::text != 'concluido' THEN
    RETURN NEW;
  END IF;

  FOR v_ordem IN
    SELECT o.id, o.numero_ordem
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.ordens o ON o.id = po.ordem_id
    WHERE po.protocolo_id = NEW.id
      AND o.tipo_ordem::text = 'conversao'
  LOOP
    SELECT * INTO v_conversao
    FROM alissonerp.conversoes_estoque
    WHERE ordem_id = v_ordem.id
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE alissonerp.conversoes_estoque
    SET status_conversao = 'concluido'
    WHERE id = v_conversao.id;

    FOR v_item IN
      SELECT * FROM alissonerp.conversao_itens
      WHERE conversao_id = v_conversao.id
    LOOP
      IF v_item.reserva_id IS NOT NULL THEN
        UPDATE alissonerp.reservas_estoque_comercial
        SET status = 'efetivado', efetivado_em = NOW()
        WHERE id = v_item.reserva_id;

        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, protocolo_id, referencia_id, observacao, created_by)
        VALUES
          (v_item.produto_id, 'saida', v_item.quantidade, 'virou_peso', v_local_loja, 'efetivado',
           v_conversao.ordem_id, NEW.id, v_conversao.ordem_id,
           'Conversao de estoque — virou peso (Ordem ' || v_ordem.numero_ordem || ')',
           NEW.recebedor_id)
        RETURNING id INTO v_mov_baixa;

        UPDATE alissonerp.conversao_itens
        SET movimento_baixa_id = v_mov_baixa
        WHERE id = v_item.id;

      ELSIF v_item.movimento_reserva_id IS NOT NULL THEN
        v_mov_baixa := v_item.movimento_reserva_id;

        UPDATE alissonerp.conversao_itens
        SET movimento_baixa_id = v_mov_baixa
        WHERE id = v_item.id;

      ELSE
        RAISE WARNING 'Conversao item % sem reserva_id nem movimento_reserva_id — pulando', v_item.id;
      END IF;
    END LOOP;

    v_insumo_id := COALESCE(v_conversao.insumo_destino, 1);

    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, insumo_id, deposito_id, local_estoque_id, marcador, ordem_id, obs)
    VALUES
      (v_conversao.peso_total, v_insumo_id, v_local_fabrica, v_local_fabrica,
       'EM'::alissonerp.enum_marcador_estoque, v_conversao.ordem_id,
       'Conversao de estoque — entrada de ' || v_conversao.peso_total || 'g de metal (Ordem ' || v_ordem.numero_ordem || ')');

    UPDATE alissonerp.ordens
    SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
    WHERE id = v_ordem.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Corrigir fn_prevent_negative_sle para considerar reservas ativas
CREATE OR REPLACE FUNCTION alissonerp.fn_prevent_negative_sle()
RETURNS TRIGGER AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(actual_qty), 0) INTO v_balance
  FROM alissonerp.stock_ledger_entry
  WHERE item_id = NEW.item_id
    AND item_type = NEW.item_type
    AND warehouse_id = NEW.warehouse_id
    AND is_cancelled = false;

  IF NEW.actual_qty < 0 AND NEW.item_type = 'produto' THEN
    v_balance := v_balance + COALESCE((
      SELECT SUM(quantidade)
      FROM alissonerp.reservas_estoque_comercial
      WHERE produto_id = NEW.item_id
        AND local_estoque_id = NEW.warehouse_id
        AND status = 'ativo'
    ), 0);
  END IF;

  IF v_balance + NEW.actual_qty < 0 THEN
    RAISE EXCEPTION 'STOCK_NEGATIVE: Saldo insuficiente no almoxarifado. Item=%, Warehouse=%',
      NEW.item_id, NEW.warehouse_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
