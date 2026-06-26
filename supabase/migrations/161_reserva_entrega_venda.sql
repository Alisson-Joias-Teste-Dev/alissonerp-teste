-- ============================================================
-- Migration 161 — Reserva de estoque + status "entregue"
--
-- Fluxo:
--   rascunho (insert item)  → cria RESERVA (bloqueia disponível)
--   rascunho → aprovado     → mantém reserva (stock reservado)
--   aprovado/enviado → entregue → converte reserva em saída efetivada
--                              + marca ordens vinculadas como entregue
--   cancelado               → cancela reservas ativas
--                              + estorna movimentos efetivados (se entregue)
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. TABELA reservas_estoque_comercial
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservas_estoque_comercial (
  id                SERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL,
  venda_id          INTEGER NOT NULL REFERENCES vendas_erp(id) ON DELETE CASCADE,
  item_venda_id     INTEGER NOT NULL REFERENCES itens_venda_erp(id) ON DELETE CASCADE,
  quantidade        INTEGER NOT NULL CHECK (quantidade > 0),
  local_estoque_id  INTEGER NOT NULL DEFAULT 2 REFERENCES locais_estoque(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'efetivado', 'cancelado')),
  efetivado_em      TIMESTAMPTZ,
  cancelado_em      TIMESTAMPTZ,
  movimento_id      INTEGER REFERENCES movimentacoes_estoque_comercial(id),
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservas_ec_venda    ON reservas_estoque_comercial(venda_id);
CREATE INDEX IF NOT EXISTS idx_reservas_ec_produto  ON reservas_estoque_comercial(produto_id);
CREATE INDEX IF NOT EXISTS idx_reservas_ec_item     ON reservas_estoque_comercial(item_venda_id);
CREATE INDEX IF NOT EXISTS idx_reservas_ec_status   ON reservas_estoque_comercial(status);

GRANT SELECT, INSERT, UPDATE ON reservas_estoque_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE reservas_estoque_comercial_id_seq TO authenticated;

-- ──────────────────────────────────────────────────────────
-- 2. fn_estoque_comercial_baixa_venda (INSERT em itens_venda_erp)
--    rascunho  → cria RESERVA (não deduz estoque físico)
--    aprovado+ → deduz estoque direto
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_baixa_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
BEGIN
  SELECT situacao INTO v_situacao FROM vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  IF v_situacao = 'rascunho' THEN
    -- Reserva: bloqueia disponível sem deduzir estoque físico
    INSERT INTO reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
    -- Venda já aprovada/enviada/entregue: deduzir direto
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

-- ──────────────────────────────────────────────────────────
-- 3. fn_estoque_comercial_reversao_item (DELETE em itens_venda_erp)
--    Cancela reserva ativa ou estorna movimento efetivado
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_reversao_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo   BOOLEAN;
  v_reserva_id     INTEGER;
  v_mov_original   RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  SELECT ativo INTO v_config_ativo FROM estoque_comercial_config WHERE produto_id = OLD.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN OLD; END IF;

  -- 1. Tentar cancelar reserva ativa
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

  -- 2. Estornar movimento efetivado (se existir)
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
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, estorno_de_id, observacao)
    VALUES
      (OLD.produto_id, 'entrada', OLD.quantidade, 'estorno', OLD.venda_id, 'vendas_erp',
       v_mov_original.local_estoque_id, 'efetivado', v_mov_original.id,
       'Estorno - item removido da venda')
    RETURNING id INTO v_mov_reverso_id;

    UPDATE movimentacoes_estoque_comercial
    SET estornado_por_id = v_mov_reverso_id, status = 'estornado'
    WHERE id = v_mov_original.id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- 4. fn_estoque_comercial_entrega_venda (UPDATE vendas_erp → entregue)
--    Converte reservas ativas em movimentos efetivados de saída
--    + marca ordens vinculadas como entregue
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_entrega_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_reserva    RECORD;
  v_mov_id     INTEGER;
BEGIN
  IF NEW.situacao != 'entregue' THEN RETURN NEW; END IF;
  IF OLD.situacao = 'entregue' THEN RETURN NEW; END IF;

  -- Converter cada reserva ativa em movimento de saída efetivado
  FOR v_reserva IN
    SELECT id, produto_id, quantidade, local_estoque_id
    FROM reservas_estoque_comercial
    WHERE venda_id = NEW.id AND status = 'ativo'
  LOOP
    INSERT INTO movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (v_reserva.produto_id, 'saida', v_reserva.quantidade, 'venda',
       NEW.id, 'vendas_erp', v_reserva.local_estoque_id, 'efetivado',
       'Entrega venda #' || NEW.numero_venda)
    RETURNING id INTO v_mov_id;

    UPDATE reservas_estoque_comercial
    SET status = 'efetivado', efetivado_em = now(), movimento_id = v_mov_id
    WHERE id = v_reserva.id;
  END LOOP;

  -- Marcar ordens vinculadas como entregue
  UPDATE ordens
  SET situacao = 'entregue'
  WHERE venda_id = NEW.id
    AND situacao NOT IN ('cancelado', 'entregue');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- 5. fn_estoque_comercial_cancelamento_venda (UPDATE → cancelado)
--    Cancela reservas ativas + estorna movimentos efetivados
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_cancelamento_venda()
RETURNS TRIGGER AS $$
DECLARE
  v_mov            RECORD;
  v_mov_reverso_id INTEGER;
BEGIN
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- 1. Cancelar todas as reservas ativas
  UPDATE reservas_estoque_comercial
  SET status = 'cancelado', cancelado_em = now()
  WHERE venda_id = NEW.id AND status = 'ativo';

  -- 2. Estornar movimentos efetivados de saída (caso já tenha sido entregue)
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

-- ──────────────────────────────────────────────────────────
-- 6. fn_estoque_comercial_update_qtd_item (UPDATE quantidade)
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_estoque_comercial_update_qtd_item()
RETURNS TRIGGER AS $$
DECLARE
  v_config_ativo BOOLEAN;
  v_situacao     TEXT;
  v_delta        INTEGER;
  v_reserva_id   INTEGER;
BEGIN
  IF NEW.quantidade = OLD.quantidade THEN RETURN NEW; END IF;

  SELECT situacao INTO v_situacao FROM vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo INTO v_config_ativo FROM estoque_comercial_config WHERE produto_id = NEW.produto_id;
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  v_delta := NEW.quantidade - OLD.quantidade;

  IF v_situacao = 'rascunho' OR v_situacao = 'aprovado' OR v_situacao = 'enviado' THEN
    -- Atualizar quantidade da reserva ativa
    SELECT id INTO v_reserva_id
    FROM reservas_estoque_comercial
    WHERE item_venda_id = NEW.id AND status = 'ativo'
    LIMIT 1;

    IF v_reserva_id IS NOT NULL THEN
      UPDATE reservas_estoque_comercial SET quantidade = NEW.quantidade WHERE id = v_reserva_id;
    END IF;
  ELSE
    -- Já entregue: criar movimento de ajuste
    IF v_delta > 0 THEN
      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'saida', v_delta, 'venda', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste +' || v_delta || ' item #' || NEW.id);
    ELSIF v_delta < 0 THEN
      INSERT INTO movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
         local_estoque_id, status, observacao)
      VALUES
        (NEW.produto_id, 'entrada', ABS(v_delta), 'devolucao', NEW.venda_id, 'vendas_erp',
         2, 'efetivado', 'Ajuste ' || v_delta || ' item #' || NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- 7. VIEW: vw_saldo_estoque_comercial
--    Mantém colunas originais na mesma ordem + adiciona reservado/disponivel
-- ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS vw_saldo_estoque_comercial CASCADE;
CREATE VIEW vw_saldo_estoque_comercial AS
SELECT
  p.id_produto                                                            AS produto_id,
  p.nome                                                                  AS nome_produto,
  p.sku,
  COALESCE(p.categoria, '')                                               AS categoria,
  -- Saldo físico: apenas movimentos efetivados (não estornados)
  COALESCE(SUM(
    CASE
      WHEN m.tipo = 'entrada' AND (m.status = 'efetivado' OR m.status IS NULL) THEN  m.quantidade
      WHEN m.tipo = 'saida'   AND (m.status = 'efetivado' OR m.status IS NULL) THEN -m.quantidade
      ELSE 0
    END
  ), 0)::INTEGER                                                          AS saldo,
  COALESCE(cfg.estoque_minimo, 0)                                         AS estoque_minimo,
  COALESCE(cfg.ativo, false)                                              AS ativo,
  cfg.id                                                                  AS config_id,
  COUNT(m.id)::INTEGER                                                    AS total_movimentacoes,
  -- Reservado: vendas aprovadas/enviadas aguardando entrega
  COALESCE((
    SELECT SUM(r.quantidade)
    FROM reservas_estoque_comercial r
    WHERE r.produto_id = p.id_produto AND r.status = 'ativo'
  ), 0)::INTEGER                                                          AS reservado,
  -- Disponível = saldo físico - reservado
  (
    COALESCE(SUM(
      CASE
        WHEN m.tipo = 'entrada' AND (m.status = 'efetivado' OR m.status IS NULL) THEN  m.quantidade
        WHEN m.tipo = 'saida'   AND (m.status = 'efetivado' OR m.status IS NULL) THEN -m.quantidade
        ELSE 0
      END
    ), 0)
    - COALESCE((
        SELECT SUM(r.quantidade)
        FROM reservas_estoque_comercial r
        WHERE r.produto_id = p.id_produto AND r.status = 'ativo'
      ), 0)
  )::INTEGER                                                              AS disponivel
FROM public.produtos p
LEFT JOIN estoque_comercial_config           cfg ON cfg.produto_id = p.id_produto
LEFT JOIN movimentacoes_estoque_comercial    m   ON m.produto_id   = p.id_produto
WHERE cfg.ativo = true
GROUP BY p.id_produto, p.nome, p.sku, p.categoria, cfg.estoque_minimo, cfg.ativo, cfg.id;

GRANT SELECT ON vw_saldo_estoque_comercial TO authenticated;

-- ──────────────────────────────────────────────────────────
-- 8. RECRIAR TRIGGERS
-- ──────────────────────────────────────────────────────────

-- itens_venda_erp
DROP TRIGGER IF EXISTS trg_estoque_comercial_baixa_venda    ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_baixa_venda
  AFTER INSERT ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_baixa_venda();

DROP TRIGGER IF EXISTS trg_estoque_comercial_reversao_item  ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_reversao_item
  AFTER DELETE ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_reversao_item();

DROP TRIGGER IF EXISTS trg_estoque_comercial_update_qtd_item ON itens_venda_erp;
CREATE TRIGGER trg_estoque_comercial_update_qtd_item
  AFTER UPDATE ON itens_venda_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_update_qtd_item();

-- vendas_erp
DROP TRIGGER IF EXISTS trg_estoque_comercial_cancelamento_venda ON vendas_erp;
CREATE TRIGGER trg_estoque_comercial_cancelamento_venda
  BEFORE UPDATE ON vendas_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_cancelamento_venda();

DROP TRIGGER IF EXISTS trg_estoque_comercial_entrega_venda ON vendas_erp;
CREATE TRIGGER trg_estoque_comercial_entrega_venda
  BEFORE UPDATE ON vendas_erp
  FOR EACH ROW EXECUTE FUNCTION fn_estoque_comercial_entrega_venda();

-- ──────────────────────────────────────────────────────────
-- 9. GRANTS
-- ──────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_baixa_venda()           TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_reversao_item()         TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_update_qtd_item()       TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_entrega_venda()         TO authenticated;
GRANT EXECUTE ON FUNCTION fn_estoque_comercial_cancelamento_venda()    TO authenticated;
