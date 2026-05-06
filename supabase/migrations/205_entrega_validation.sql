-- Migration 205: Validacao de Entrega - Bloqueia se reposicao pendente
-- Nao permite marcar venda como entregue se existem ordens de reposicao
-- still em aberto (criado/aguardando/em_andamento)

CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_reserva RECORD;
  v_mov_id  INTEGER;
  v_pendentes INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue'  THEN RETURN NEW; END IF;

  -- 🔒 Bloquear entrega se a venda possui ordens de reposicao pendentes
  SELECT COUNT(*) INTO v_pendentes
  FROM alissonerp.ordens
  WHERE venda_id = NEW.id
    AND tipo_ordem = 'reposicao_venda'
    AND situacao IN ('criado', 'rascunho');

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'ENTREGA_BLOCKED: Venda #% possui % ordem(ns) de reposicao pendente(s). Conclua antes de marcar como entregue.',
      NEW.numero_venda, v_pendentes;
  END IF;

  FOR v_reserva IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM alissonerp.reservas_estoque_comercial
    WHERE venda_id = NEW.id AND status = 'ativo'
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (v_reserva.produto_id, 'saida', v_reserva.quantidade, 'venda',
       NEW.id, 'vendas_erp', COALESCE(v_reserva.local_estoque_id, 2), 'efetivado',
       'Entrega venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_id;

    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  -- 🔖 Marcar RFIDs vinculados a esta venda como vendidos
  UPDATE alissonerp.joias_rfid
  SET status = 'vendido', sold_at = now()
  WHERE venda_id = NEW.id
    AND status = 'reservado';

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_entrega_venda() TO authenticated;
