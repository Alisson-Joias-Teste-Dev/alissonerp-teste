-- ============================================================
-- Migration 169 — Fix search_path nas trigger functions do
--                 estoque comercial (migrations 141 / 161)
--
-- Problema: as funcoes criadas em 141/161 usam SECURITY DEFINER
-- mas nao fixam search_path. Em sessoes normais o PostgreSQL usa
-- o search_path do owner (geralmente so "public"), entao tabelas
-- de alissonerp como vendas_erp sao invisiveis.
--
-- Fix: recriar cada funcao com:
--   LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path = alissonerp, directus, public
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────
-- 1. fn_estoque_comercial_baixa_venda
-- ──────────────────────────────────────────────────────────
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

  IF v_situacao = 'rascunho' THEN
    INSERT INTO alissonerp.reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
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

-- ──────────────────────────────────────────────────────────
-- 2. fn_estoque_comercial_reversao_item
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_reversao_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_config_ativo   BOOLEAN;
  v_reserva_id     INTEGER;
  v_mov_original   RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = OLD.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN OLD; END IF;

  SELECT id INTO v_reserva_id
  FROM alissonerp.reservas_estoque_comercial
  WHERE item_venda_id = OLD.id AND status = 'ativo'
  LIMIT 1;

  IF v_reserva_id IS NOT NULL THEN
    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'cancelado', cancelado_em = now()
    WHERE id = v_reserva_id;
    RETURN OLD;
  END IF;

  SELECT id, quantidade, local_estoque_id INTO v_mov_original
  FROM alissonerp.movimentacoes_estoque_comercial
  WHERE referencia_id = OLD.venda_id
    AND referencia_tipo = 'vendas_erp'
    AND produto_id = OLD.produto_id
    AND tipo = 'saida'
    AND status = 'efetivado'
    AND estornado_por_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mov_original.id IS NOT NULL THEN
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (OLD.produto_id, 'entrada', OLD.quantidade, 'estorno', OLD.venda_id, 'vendas_erp',
       v_mov_original.local_estoque_id, 'efetivado', v_mov_original.id,
       'Estorno - item removido da venda')
    RETURNING id INTO v_mov_reverso_id;

    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov_original.id;
  END IF;

  RETURN OLD;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 3. fn_estoque_comercial_entrega_venda
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_reserva RECORD;
  v_mov_id  INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue'  THEN RETURN NEW; END IF;

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
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Entrega venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_id;

    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  -- Marcar ordens vinculadas como entregue (directus.ordens)
  UPDATE directus.ordens
  SET situacao = 'entregue'
  WHERE venda_id = NEW.id
    AND situacao NOT IN ('cancelado', 'entregue');

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 4. fn_estoque_comercial_cancelamento_venda
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_cancelamento_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_mov            RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  UPDATE alissonerp.reservas_estoque_comercial
  SET status = 'cancelado', cancelado_em = now()
  WHERE venda_id = NEW.id AND status = 'ativo';

  FOR v_mov IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'vendas_erp'
      AND tipo = 'saida'
      AND status = 'efetivado'
      AND estornado_por_id IS NULL
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (v_mov.produto_id, 'entrada', v_mov.quantidade, 'cancelamento',
       NEW.id, 'vendas_erp', v_mov.local_estoque_id, 'efetivado', v_mov.id,
       'Estorno por cancelamento da venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_reverso_id;

    UPDATE alissonerp.movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 5. fn_estoque_comercial_update_qtd_item
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_update_qtd_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
  v_delta        INTEGER;
  v_reserva_id   INTEGER;
BEGIN
  IF NEW.quantidade = OLD.quantidade THEN RETURN NEW; END IF;

  SELECT situacao INTO v_situacao FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM alissonerp.estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  v_delta := NEW.quantidade - OLD.quantidade;

  IF v_situacao = 'rascunho' OR v_situacao = 'aprovado' OR v_situacao = 'enviado' THEN
    SELECT id INTO v_reserva_id
    FROM alissonerp.reservas_estoque_comercial
    WHERE item_venda_id = NEW.id AND status = 'ativo'
    LIMIT 1;

    IF v_reserva_id IS NOT NULL THEN
      UPDATE alissonerp.reservas_estoque_comercial SET quantidade = NEW.quantidade WHERE id = v_reserva_id;
    END IF;
  ELSE
    IF v_delta > 0 THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'saida', v_delta, 'venda', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste +' || v_delta || ' item #' || NEW.id);
    ELSIF v_delta < 0 THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'entrada', ABS(v_delta), 'devolucao', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste ' || v_delta || ' item #' || NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────
-- 6. fn_estoque_comercial_aprovar_venda (migration 141)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_aprovar_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_reserva    RECORD;
  v_mov_id     INTEGER;
BEGIN
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.situacao != 'rascunho' THEN RETURN NEW; END IF;

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
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Efetivação reserva #' || v_reserva.id || ' - venda aprovada')
    RETURNING id INTO v_mov_id;

    UPDATE alissonerp.reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()           TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_reversao_item()         TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_update_qtd_item()       TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_entrega_venda()         TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_cancelamento_venda()    TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_estoque_comercial_aprovar_venda()         TO authenticated;

-- ============================================================
-- Fim migration 169
-- ============================================================
