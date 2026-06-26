-- Migration 111: Auto-redução de estoque comercial na venda
-- Quando um item é adicionado/removido de uma venda, movimenta estoque automaticamente.
-- Guard: só para produtos com estoque_comercial_config.ativo = true.

SET search_path TO alissonerp;

-- ─── Trigger: baixa automática ao INSERT item de venda ─────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_baixa_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao TEXT;
BEGIN
  -- Só processa se a venda NÃO está cancelada
  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = NEW.venda_id;

  IF v_situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Verifica se produto tem estoque comercial ativo
  SELECT ativo INTO v_config_ativo
  FROM alissonerp.estoque_comercial_config
  WHERE produto_id = NEW.produto_id;

  -- Se não existe config ou não está ativo, ignora
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN
    RETURN NEW;
  END IF;

  -- Registra saída no estoque comercial
  INSERT INTO alissonerp.movimentacoes_estoque_comercial
    (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo, observacao)
  VALUES
    (NEW.produto_id, 'saida', NEW.quantidade, 'venda', NEW.venda_id, 'vendas_erp',
     'Venda automática - item #' || NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: reversão ao DELETE item de venda ─────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_reversao_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
BEGIN
  -- Verifica se produto tem estoque comercial ativo
  SELECT ativo INTO v_config_ativo
  FROM alissonerp.estoque_comercial_config
  WHERE produto_id = OLD.produto_id;

  IF v_config_ativo IS NULL OR v_config_ativo = false THEN
    RETURN OLD;
  END IF;

  -- Registra entrada (devolução) no estoque comercial
  INSERT INTO alissonerp.movimentacoes_estoque_comercial
    (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo, observacao)
  VALUES
    (OLD.produto_id, 'entrada', OLD.quantidade, 'devolucao', OLD.venda_id, 'vendas_erp',
     'Reversão - item removido da venda');

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: estorno completo ao cancelar venda ───────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_cancelamento_venda()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
  v_config_ativo BOOLEAN;
BEGIN
  -- Só executa se situação mudou para 'cancelado'
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Para cada item da venda, reverte estoque
  FOR r IN
    SELECT produto_id, quantidade FROM alissonerp.itens_venda_erp WHERE venda_id = NEW.id
  LOOP
    SELECT ativo INTO v_config_ativo
    FROM alissonerp.estoque_comercial_config
    WHERE produto_id = r.produto_id;

    IF v_config_ativo = true THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo, observacao)
      VALUES
        (r.produto_id, 'entrada', r.quantidade, 'cancelamento', NEW.id, 'vendas_erp',
         'Estorno por cancelamento da venda #' || NEW.numero_venda);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Criar triggers ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_estoque_comercial_baixa_venda ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_baixa_venda
  AFTER INSERT ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_estoque_comercial_baixa_venda();

DROP TRIGGER IF EXISTS trg_estoque_comercial_reversao_item ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_reversao_item
  AFTER DELETE ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_estoque_comercial_reversao_item();

DROP TRIGGER IF EXISTS trg_estoque_comercial_cancelamento_venda ON alissonerp.vendas_erp;
CREATE TRIGGER trg_estoque_comercial_cancelamento_venda
  BEFORE UPDATE ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_estoque_comercial_cancelamento_venda();

-- ─── Coluna video_obs_interna (fix referência no código) ───────────────────────
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS video_obs_interna TEXT;

-- ─── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_baixa_venda() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_reversao_item() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_cancelamento_venda() TO authenticated;

-- ─── Trigger: ajuste automático ao UPDATE quantidade de item de venda ──────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_update_qtd_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao TEXT;
  v_delta INTEGER;
BEGIN
  -- Só processa se quantidade mudou
  IF NEW.quantidade = OLD.quantidade THEN
    RETURN NEW;
  END IF;

  -- Só processa se a venda NÃO está cancelada
  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = NEW.venda_id;

  IF v_situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Verifica se produto tem estoque comercial ativo
  SELECT ativo INTO v_config_ativo
  FROM alissonerp.estoque_comercial_config
  WHERE produto_id = NEW.produto_id;

  IF v_config_ativo IS NULL OR v_config_ativo = false THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.quantidade - OLD.quantidade;

  IF v_delta > 0 THEN
    -- Aumentou quantidade: registrar saída adicional
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo, observacao)
    VALUES
      (NEW.produto_id, 'saida', v_delta, 'venda', NEW.venda_id, 'vendas_erp',
       'Ajuste quantidade item #' || NEW.id || ' (+' || v_delta || ')');
  ELSIF v_delta < 0 THEN
    -- Diminuiu quantidade: registrar entrada (devolução parcial)
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo, observacao)
    VALUES
      (NEW.produto_id, 'entrada', ABS(v_delta), 'devolucao', NEW.venda_id, 'vendas_erp',
       'Ajuste quantidade item #' || NEW.id || ' (' || v_delta || ')');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_estoque_comercial_update_qtd_item ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_update_qtd_item
  AFTER UPDATE ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_estoque_comercial_update_qtd_item();

GRANT EXECUTE ON FUNCTION fn_estoque_comercial_update_qtd_item() TO authenticated;
