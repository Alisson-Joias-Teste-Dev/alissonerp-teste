-- ============================================================
-- Migration 301 — Bloqueio de entrega por STATUS da ordem de reposição (2026-06-12)
--
-- REGRA DE NEGÓCIO:
-- O QUE: o gatilho fn_estoque_comercial_entrega_venda barrava a entrega quando
--   havia ordem de reposição com situacao IN ('criado','rascunho') E
--   status != 'concluido'. Esse critério deixava passar uma ordem
--   'criado' + 'em_andamento' (peça AINDA em produção): a situacao continua
--   'criado' mas a peça não está pronta.
-- POR QUE: quem indica que a peça de reposição (sob encomenda) está pronta é o
--   STATUS de produção (alissonerp.ordens.status). Decisão do Jonathan (12/06):
--   usar o STATUS. Bloqueia enquanto status NÃO for 'concluido' nem 'cancelado'
--   (ou seja: 'aguardando' e 'em_andamento' bloqueiam).
-- IMPACTO SE REMOVIDO: venda com reposição em produção poderia ser entregue
--   antes da peça ficar pronta (estoque negativo / entrega de peça inexistente).
--
-- Mesma regra agora nos 3 pontos: botão "Marcar Entrega", criarEntrega (montar)
-- e este gatilho (último guard no UPDATE para 'entregue').
-- Reescreve SÓ o critério da reposição; resto da função idêntico.
--
-- Database Safety §2: CREATE OR REPLACE (nunca DROP).
-- ============================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_reserva   RECORD;
  v_mov_id    INTEGER;
  v_pendentes INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue'  THEN RETURN NEW; END IF;

  -- 🔒 Bloquear entrega se a venda possui ordens de reposição NÃO concluídas.
  -- Critério por STATUS de produção (alissonerp.ordens.status): bloqueia
  -- 'aguardando'/'em_andamento'; 'concluido' (pronta) e 'cancelado' (descartada)
  -- liberam. Pega também 'reposicao_loja'.
  SELECT COUNT(*) INTO v_pendentes
  FROM alissonerp.ordens
  WHERE venda_id = NEW.id
    AND tipo_ordem IN ('reposicao_venda', 'reposicao_loja')
    AND status NOT IN ('concluido', 'cancelado');

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'ENTREGA_BLOCKED: Venda #% possui % ordem(ns) de reposição não concluída(s). Conclua ou cancele antes de marcar como entregue.',
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
$function$;

-- ============================================================
-- Fim migration 301
-- ============================================================
