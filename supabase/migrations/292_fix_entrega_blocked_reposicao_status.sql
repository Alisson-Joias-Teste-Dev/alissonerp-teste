-- Migration 292: Corrige bloqueio de entrega para ordens de reposição concluídas
-- ─────────────────────────────────────────────────────────────────────────────
-- Problema:
--   A trigger fn_estoque_comercial_entrega_venda checava apenas situacao
--   IN ('criado', 'rascunho') para bloquear a entrega. Porém o campo
--   situacao nunca muda de 'criado' — quem muda é o campo status para
--   'concluido' quando a ordem é finalizada. Então mesmo ordens concluídas
--   continuavam bloqueando a entrega.
--
-- Correção:
--   Adicionar AND status != 'concluido' para que ordens com status concluído
--   (independente da situacao) não bloqueiem a entrega.
--
-- Impacto se removido:
--   Vendas com ordens de reposição concluídas voltam a travar na entrega.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4. fn_estoque_comercial_entrega_venda — corrigida
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_reserva   RECORD;
  v_mov_id    INTEGER;
  v_pendentes INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue'  THEN RETURN NEW; END IF;

  -- 🔒 Bloquear entrega se a venda possui ordens de reposição pendentes
  -- REGRA DE NEGÓCIO: situacao ('criado', 'rascunho') é o status do ciclo de vida
  -- da ordem, mas quem indica conclusão é o campo status = 'concluido'.
  -- Uma ordem 'criado' + 'concluido' já foi finalizada e não deve bloquear.
  SELECT COUNT(*) INTO v_pendentes
  FROM alissonerp.ordens
  WHERE venda_id = NEW.id
    AND tipo_ordem = 'reposicao_venda'
    AND situacao IN ('criado', 'rascunho')
    AND status  != 'concluido';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'ENTREGA_BLOCKED: Venda #% possui % ordem(ns) de reposição pendente(s). Conclua antes de marcar como entregue.',
      NEW.numero_venda, v_pendentes;
  END IF;

  -- Converter reservas ativas em saída efetivada
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
