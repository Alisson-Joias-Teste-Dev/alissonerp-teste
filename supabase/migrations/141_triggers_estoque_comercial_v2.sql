-- ============================================================
-- Migration 141 — Triggers Estoque Comercial v2
-- Redesign: reserva no rascunho, efetivacao na aprovacao,
-- estorno rastreavel, entrada auto producao, transferencia 2 etapas
-- ============================================================

SET search_path TO alissonerp;

-- ══════════════════════════════════════════════════════════════
-- 1. BAIXA VENDA → RESERVA (rascunho) ou MOVIMENTO (aprovado+)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_baixa_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao TEXT;
BEGIN
  SELECT situacao INTO v_situacao
  FROM vendas_erp WHERE id = NEW.venda_id;

  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo
  FROM estoque_comercial_config WHERE produto_id = NEW.produto_id;

  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  IF v_situacao = 'rascunho' THEN
    -- Criar RESERVA (nao deduz estoque fisico, so bloqueia disponivel)
    INSERT INTO reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
    -- Venda ja aprovada/enviada/concluida: deduzir direto
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (NEW.produto_id, 'saida', NEW.quantidade, 'venda', NEW.venda_id, 'vendas_erp',
       2, 'efetivado', 'Venda automática - item #' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 2. APROVAR VENDA → CONVERTER RESERVAS EM MOVIMENTOS
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_aprovar_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_reserva RECORD;
  v_mov_id INTEGER;
BEGIN
  -- Guard: so quando muda de rascunho para aprovado
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF OLD.situacao != 'rascunho' THEN RETURN NEW; END IF;

  -- Converter cada reserva ativa em movimento real
  FOR v_reserva IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM reservas_estoque_comercial
    WHERE venda_id = NEW.id AND status = 'ativo'
  LOOP
    -- Criar movimento de saida
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (v_reserva.produto_id, 'saida', v_reserva.quantidade, 'venda',
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Efetivação reserva #' || v_reserva.id || ' - venda aprovada')
    RETURNING id INTO v_mov_id;

    -- Marcar reserva como efetivada
    UPDATE reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 3. REVERSAO AO DELETAR ITEM
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_reversao_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_reserva_id INTEGER;
  v_mov_original RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  SELECT ativo INTO v_config_ativo
  FROM estoque_comercial_config WHERE produto_id = OLD.produto_id;

  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN OLD; END IF;

  -- Tentar cancelar reserva ativa primeiro
  SELECT id INTO v_reserva_id
  FROM reservas_estoque_comercial
  WHERE item_venda_id = OLD.id AND status = 'ativo'
  LIMIT 1;

  IF v_reserva_id IS NOT NULL THEN
    UPDATE reservas_estoque_comercial
    SET status = 'cancelado', cancelado_em = now()
    WHERE id = v_reserva_id;
    RETURN OLD;
  END IF;

  -- Se nao tem reserva, buscar movimento efetivado para estornar
  SELECT id, quantidade, local_estoque_id INTO v_mov_original
  FROM movimentacoes_estoque_comercial
  WHERE referencia_id = OLD.venda_id
    AND referencia_tipo = 'vendas_erp'
    AND produto_id = OLD.produto_id
    AND tipo = 'saida'
    AND status = 'efetivado'
    AND estornado_por_id IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_mov_original.id IS NOT NULL THEN
    -- Criar movimento reverso
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (OLD.produto_id, 'entrada', OLD.quantidade, 'estorno', OLD.venda_id, 'vendas_erp',
       v_mov_original.local_estoque_id, 'efetivado', v_mov_original.id,
       'Estorno - item removido da venda')
    RETURNING id INTO v_mov_reverso_id;

    -- Marcar original como estornado
    UPDATE movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov_original.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 4. CANCELAMENTO DE VENDA
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_cancelamento_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_reserva RECORD;
  v_mov RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- 1. Cancelar todas as reservas ativas
  UPDATE reservas_estoque_comercial
  SET status = 'cancelado', cancelado_em = now()
  WHERE venda_id = NEW.id AND status = 'ativo';

  -- 2. Estornar todos os movimentos efetivados de saida da venda
  FOR v_mov IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM movimentacoes_estoque_comercial
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'vendas_erp'
      AND tipo = 'saida'
      AND status = 'efetivado'
      AND estornado_por_id IS NULL
  LOOP
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (v_mov.produto_id, 'entrada', v_mov.quantidade, 'cancelamento',
       NEW.id, 'vendas_erp', v_mov.local_estoque_id, 'efetivado', v_mov.id,
       'Estorno por cancelamento da venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_reverso_id;

    UPDATE movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 5. UPDATE QUANTIDADE DO ITEM
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_update_qtd_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao TEXT;
  v_delta INTEGER;
  v_reserva RECORD;
BEGIN
  IF NEW.quantidade = OLD.quantidade THEN RETURN NEW; END IF;

  SELECT situacao INTO v_situacao
  FROM vendas_erp WHERE id = NEW.venda_id;

  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo
  FROM estoque_comercial_config WHERE produto_id = NEW.produto_id;

  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  v_delta := NEW.quantidade - OLD.quantidade;

  IF v_situacao = 'rascunho' THEN
    -- Atualizar reserva
    SELECT id, quantidade INTO v_reserva
    FROM reservas_estoque_comercial
    WHERE item_venda_id = NEW.id AND status = 'ativo'
    LIMIT 1;

    IF v_reserva.id IS NOT NULL THEN
      UPDATE reservas_estoque_comercial
      SET quantidade = NEW.quantidade
      WHERE id = v_reserva.id;
    END IF;
  ELSE
    -- Venda aprovada: criar movimento
    IF v_delta > 0 THEN
      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'saida', v_delta, 'venda', NEW.venda_id, 'vendas_erp',
         2, 'efetivado',
         'Ajuste quantidade item #' || NEW.id || ' (+' || v_delta || ')');
    ELSIF v_delta < 0 THEN
      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'entrada', ABS(v_delta), 'devolucao', NEW.venda_id, 'vendas_erp',
         2, 'efetivado',
         'Ajuste quantidade item #' || NEW.id || ' (' || v_delta || ')');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 6. ENTRADA AUTOMATICA DE PRODUCAO (protocolo volta + reposicao)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_estoque_comercial_entrada_producao()
RETURNS TRIGGER AS $$
DECLARE
  v_rec RECORD;
  v_config_ativo BOOLEAN;
  v_local_id INTEGER;
BEGIN
  -- Guard: so quando protocolo volta e concluido
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;
  IF NEW.direcao != 'volta' THEN RETURN NEW; END IF;

  FOR v_rec IN
    SELECT o.id AS ordem_id, o.produto_id, o.tipo_ordem
    FROM protocolo_ordens po
    JOIN ordens o ON po.ordem_id = o.id
    WHERE po.protocolo_id = NEW.id
      AND o.tipo_ordem IN ('reposicao_venda', 'reposicao_loja')
      AND o.produto_id IS NOT NULL
  LOOP
    -- Verificar se produto tem estoque comercial ativo
    SELECT ativo INTO v_config_ativo
    FROM estoque_comercial_config WHERE produto_id = v_rec.produto_id;

    IF v_config_ativo = true THEN
      -- Reposicao loja entra na Loja (id=2), reposicao venda na Fabrica (id=1)
      v_local_id := CASE WHEN v_rec.tipo_ordem = 'reposicao_loja' THEN 2 ELSE 1 END;

      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, ordem_id, protocolo_id, observacao)
      VALUES
        (v_rec.produto_id, 'entrada', 1, 'producao_auto',
         v_rec.ordem_id, 'ordens', v_local_id, 'efetivado',
         v_rec.ordem_id, NEW.id,
         'Entrada automática - protocolo volta #' || NEW.id || ' ordem #' || v_rec.ordem_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 7. TRANSFERENCIA: ENVIO (INSERT pendente → saida imediata)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_transferencia_ec_envio()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_id INTEGER;
BEGIN
  IF NEW.status != 'pendente' THEN RETURN NEW; END IF;

  -- Saida imediata do local de origem
  INSERT INTO movimentacoes_estoque_comercial
    (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
     local_estoque_id, status, observacao)
  VALUES
    (NEW.produto_id, 'saida', NEW.quantidade, 'transferencia_saida',
     NEW.id, 'transferencias_ec', NEW.local_origem_id, 'efetivado',
     'Transferência #' || NEW.id || ' → ' || (SELECT nome FROM locais_estoque WHERE id = NEW.local_destino_id))
  RETURNING id INTO v_mov_id;

  NEW.movimento_saida_id := v_mov_id;
  NEW.enviado_por := NEW.created_by;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 8. TRANSFERENCIA: RECEBIMENTO (UPDATE concluido → entrada destino)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_transferencia_ec_recebimento()
RETURNS TRIGGER AS $$
DECLARE
  v_mov_id INTEGER;
BEGIN
  -- Concluir: entrada no destino
  IF NEW.status = 'concluido' AND OLD.status = 'pendente' THEN
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (NEW.produto_id, 'entrada', NEW.quantidade, 'transferencia_entrada',
       NEW.id, 'transferencias_ec', NEW.local_destino_id, 'efetivado',
       'Recebimento transferência #' || NEW.id || ' de ' || (SELECT nome FROM locais_estoque WHERE id = NEW.local_origem_id))
    RETURNING id INTO v_mov_id;

    NEW.movimento_entrada_id := v_mov_id;
    NEW.recebido_em := now();
    RETURN NEW;
  END IF;

  -- Cancelar: estornar a saida do origem
  IF NEW.status = 'cancelado' AND OLD.status = 'pendente' THEN
    DECLARE
      v_mov_reverso_id INTEGER;
    BEGIN
      -- Criar movimento reverso da saida
      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, estorno_de_id, observacao)
      VALUES
        (NEW.produto_id, 'entrada', NEW.quantidade, 'estorno',
         NEW.id, 'transferencias_ec', OLD.local_origem_id, 'efetivado',
         OLD.movimento_saida_id,
         'Estorno transferência #' || NEW.id || ' cancelada')
      RETURNING id INTO v_mov_reverso_id;

      -- Marcar saida original como estornada
      IF OLD.movimento_saida_id IS NOT NULL THEN
        UPDATE movimentacoes_estoque_comercial
        SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
        WHERE id = OLD.movimento_saida_id;
      END IF;

      NEW.cancelado_em := now();
    END;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════
-- 9. REGISTRAR / RECRIAR TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- Baixa venda (INSERT item)
DROP TRIGGER IF EXISTS trg_estoque_comercial_baixa_venda ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_baixa_venda
  AFTER INSERT ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_baixa_venda();

-- Reversao item (DELETE item)
DROP TRIGGER IF EXISTS trg_estoque_comercial_reversao_item ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_reversao_item
  AFTER DELETE ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_reversao_item();

-- Cancelamento venda
DROP TRIGGER IF EXISTS trg_estoque_comercial_cancelamento_venda ON vendas_erp;
CREATE TRIGGER trg_estoque_comercial_cancelamento_venda
  BEFORE UPDATE ON vendas_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_cancelamento_venda();

-- Aprovacao venda (NOVO)
DROP TRIGGER IF EXISTS trg_estoque_comercial_aprovar_venda ON vendas_erp;
CREATE TRIGGER trg_estoque_comercial_aprovar_venda
  BEFORE UPDATE ON vendas_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_aprovar_venda();

-- Update quantidade item
DROP TRIGGER IF EXISTS trg_estoque_comercial_update_qtd_item ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_update_qtd_item
  AFTER UPDATE ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_update_qtd_item();

-- Entrada producao (NOVO — no protocolo)
DROP TRIGGER IF EXISTS trg_estoque_comercial_entrada_producao ON protocolos;
CREATE TRIGGER trg_estoque_comercial_entrada_producao
  BEFORE UPDATE ON protocolos
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_entrada_producao();

-- Transferencia envio (NOVO)
DROP TRIGGER IF EXISTS trg_transferencia_ec_envio ON transferencias_estoque_comercial;
CREATE TRIGGER trg_transferencia_ec_envio
  BEFORE INSERT ON transferencias_estoque_comercial
  FOR EACH ROW EXECUTE FUNCTION fn_transferencia_ec_envio();

-- Transferencia recebimento/cancelamento (NOVO)
DROP TRIGGER IF EXISTS trg_transferencia_ec_recebimento ON transferencias_estoque_comercial;
CREATE TRIGGER trg_transferencia_ec_recebimento
  BEFORE UPDATE ON transferencias_estoque_comercial
  FOR EACH ROW EXECUTE FUNCTION fn_transferencia_ec_recebimento();

-- ══════════════════════════════════════════════════════════════
-- 10. GRANTS
-- ══════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_baixa_venda() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_aprovar_venda() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_reversao_item() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_cancelamento_venda() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_update_qtd_item() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_entrada_producao() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_transferencia_ec_envio() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_transferencia_ec_recebimento() TO authenticated;
