-- ============================================================
-- Migration 267 — Ajuste de Triggers de Estoque + State Machine
--
-- Mudanças no fluxo de status da venda:
--   rascunho → aprovado → enviado → entregue → concluído
--               aprovado → entregue (direto)
--   confirmado removido do fluxo (mantido p/ vendas existentes)
--
-- Estoque:
--   fn_estoque_comercial_aprovar_venda → DESATIVADA (só retorna NEW)
--   fn_estoque_comercial_baixa_venda → rascunho/aprovado/enviado cria RESERVA
--   fn_estoque_comercial_entrega_venda → mantida (reserva → saída na entrega)
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- 1. State Machine: fn_registrar_transicao_venda
-- ──────────────────────────────────────────────────────────────
-- Remove 'confirmado' como destino de 'aprovado'
-- Adiciona 'enviado' e 'entregue' como destinos de 'aprovado'
-- Mantém 'confirmado' como estado válido p/ vendas existentes
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_registrar_transicao_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_de   VARCHAR(30) := OLD.situacao;
  v_para VARCHAR(30) := NEW.situacao;
  v_ok   BOOLEAN;
BEGIN
  -- Nao faz nada se situacao nao mudou
  IF v_de IS NOT DISTINCT FROM v_para THEN
    RETURN NEW;
  END IF;

  -- Máquina de estados — Novo fluxo:
  -- rascunho → aprovado → enviado/entregue → concluído
  -- confirmado removido, mas aceito p/ vendas que ainda possuem esse status
  IF v_de IS NULL THEN
    v_ok := v_para = ANY(ARRAY['rascunho','aprovado','confirmado','cancelado']);
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado']);
  ELSIF v_de = 'aprovado' THEN
    -- Novo: pode ir para enviado, entregue, concluido ou cancelado
    v_ok := v_para = ANY(ARRAY['enviado','entregue','concluido','cancelado']);
  ELSIF v_de = 'confirmado' THEN
    -- Mantido para vendas existentes — permite migrar para qualquer status do fluxo
    v_ok := v_para = ANY(ARRAY['aprovado','enviado','entregue','concluido','cancelado']);
  ELSIF v_de = 'enviado' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de = 'entregue' THEN
    v_ok := v_para = ANY(ARRAY['concluido']);
  ELSIF v_de IN ('concluido','cancelado') THEN
    v_ok := false;
  ELSE
    -- Estados desconhecidos: permissivo para compatibilidade futura
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transição inválida: % → %', COALESCE(v_de, 'NULL'), v_para;
  END IF;

  -- Registrar transição na auditoria
  INSERT INTO alissonerp.vendas_transicoes
    (venda_id, de_situacao, para_situacao, usuario_id, payload)
  VALUES (
    NEW.id,
    v_de,
    v_para,
    auth.uid(),
    jsonb_build_object(
      'total_venda', NEW.total_venda,
      'total_pago',  NEW.total_pago,
      'cliente_id',  NEW.cliente_id,
      'updated_at',  NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_estoque_comercial_aprovar_venda — DESATIVADA
-- ──────────────────────────────────────────────────────────────
-- Antes: convertia reservas ativas em saída efetivada no momento
--        da aprovação.
-- Agora: reservas permanecem ativas até a ENTREGA da venda.
--         A função existe apenas para compatibilidade, mas não
--         faz mais nenhuma movimentação de estoque.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_aprovar_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
BEGIN
  -- Guards originais mantidos para compatibilidade com trigger existente
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.situacao != 'rascunho' THEN RETURN NEW; END IF;

  -- ⛔ Aprovação NÃO move mais estoque.
  -- Reservas criadas no rascunho permanecem ativas.
  -- A saída efetivada ocorre apenas quando a venda for entregue.
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. fn_estoque_comercial_baixa_venda
-- ──────────────────────────────────────────────────────────────
-- Novo comportamento:
--   rascunho / aprovado / enviado → cria RESERVA (status = ativo)
--   cancelado                    → no-op
--   entregue / concluido / outro → movimento SAÍDA efetivado
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
BEGIN
  SELECT situacao INTO v_situacao FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  -- rascunho, aprovado, enviado: cria reserva (estoque só é dado baixa na entrega)
  IF v_situacao IN ('rascunho', 'aprovado', 'enviado') THEN
    INSERT INTO alissonerp.reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
    -- entregue, concluido ou qualquer outro: movimento de saída direto
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (NEW.produto_id, 'saida', NEW.quantidade, 'venda', NEW.venda_id, 'vendas_erp',
       2, 'efetivado', 'Venda automática - item #' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. fn_estoque_comercial_entrega_venda
-- ──────────────────────────────────────────────────────────────
-- Mantida da migration 205:
--   - Bloqueio se existem ordens de reposição pendentes
--   - Converte reservas ativas em saída efetivada
--   - Marca RFIDs vinculados como 'vendido'
-- ──────────────────────────────────────────────────────────────
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
  SELECT COUNT(*) INTO v_pendentes
  FROM alissonerp.ordens
  WHERE venda_id = NEW.id
    AND tipo_ordem = 'reposicao_venda'
    AND situacao IN ('criado', 'rascunho');

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

-- ──────────────────────────────────────────────────────────────
-- Grants
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION alissonerp.fn_registrar_transicao_venda()          TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_aprovar_venda()    TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()      TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()    TO authenticated;

-- ============================================================
-- Fim migration 267
-- ============================================================
