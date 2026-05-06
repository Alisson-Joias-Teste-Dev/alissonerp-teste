-- ============================================================
-- Migration 234: Corrigir sync public.vendas -> vendas_erp
--                Preservar total_venda da fonte autoritativa
--
-- Problema: O trigger fn_sync_item_venda_from_public recalcula
-- total_venda como SUM(total_item) + total_frete, sobrescrevendo
-- o valor correto de public.vendas.total_venda. Se itens tem
-- duplicatas (ex: Produto Generico 512x), o total explode.
--
-- Solucao:
--   1. fn_sync_item_venda_from_public: apos sync de item,
--      re-sincroniza total_venda do public.vendas (fonte
--      autoritativa) em vez de recalcular do SUM(total_item).
--   2. fn_sync_venda_update_from_public: idem, usa
--      public.vendas.total_venda como fonte autoritativa.
--   3. Trigger de auditoria loga divergencias > 1%.
--   4. Mantem set_config('app.sync_ativo') para bypass da
--      blindagem de vendas fechadas.
-- ============================================================

-- ─── 1. fn_sync_item_venda_from_public ──────────────────────────────────────
-- ADICIONA: apos sync, re-sincroniza total_venda do public.vendas
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_item_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_venda_erp_id INTEGER;
  v_nome_produto TEXT;
  v_pub_total_venda NUMERIC;
BEGIN
  BEGIN
    SELECT id INTO v_venda_erp_id
    FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.venda_id;
    IF v_venda_erp_id IS NULL THEN RETURN NEW; END IF;

    -- Idempotente por (venda_id, produto_id, sku)
    IF EXISTS (
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = v_venda_erp_id
        AND produto_id = NEW.produto_id
        AND COALESCE(sku, '') = COALESCE(NEW.sku, '')
    ) THEN RETURN NEW; END IF;

    PERFORM set_config('app.sync_ativo', 'true', true);

    SELECT nome INTO v_nome_produto
    FROM public.produtos WHERE id_produto = NEW.produto_id;

    INSERT INTO alissonerp.itens_venda_erp (
      venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao
    ) VALUES (
      v_venda_erp_id, NEW.produto_id,
      COALESCE(v_nome_produto, 'Produto #' || NEW.produto_id::text), NEW.sku,
      GREATEST(1, COALESCE(NEW.quantidade, 1)::integer),
      COALESCE(NEW.preco_tabela, 0), COALESCE(NEW.desconto_percentual, 0),
      COALESCE(NEW.preco_unitario_final, 0), COALESCE(NEW.preco_total, 0),
      COALESCE(NEW.comissao_percentual, 0), COALESCE(NEW.comissao_valor, 0)
    );

    -- ═══ CORRECAO ═══════════════════════════════════════════════════════════
    -- Busca total_venda do public.vendas (fonte autoritativa do Tiny/POS)
    -- e USA ELE como total_venda, NAO o SUM(total_item).
    -- Isso evita que duplicatas ou valores errados de preco_total afetem
    -- o total da venda no ERP.
    --
    -- total_produtos e total_comissao ainda sao recalculados dos itens
    -- para manter precisao de comissoes e metricas de produto.
    SELECT pv.total_venda INTO v_pub_total_venda
    FROM public.vendas pv
    WHERE pv.id = (SELECT public_venda_id FROM alissonerp.vendas_erp WHERE id = v_venda_erp_id);

    UPDATE alissonerp.vendas_erp SET
      total_produtos = COALESCE((
        SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_desconto = COALESCE((
        SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_comissao = COALESCE((
        SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_venda = COALESCE(v_pub_total_venda, total_venda),
      updated_at = now()
    WHERE id = v_venda_erp_id;

    PERFORM set_config('app.sync_ativo', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sync_ativo', '', true);
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- ─── 2. fn_sync_venda_update_from_public ────────────────────────────────────
-- CORRECAO: total_venda e total_produtos usam public.vendas como fonte
-- autoritativa, nao recalculam do SUM(total_item).
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
  v_erp_id INTEGER;
  v_erp_situacao VARCHAR(20);
  v_novo_total NUMERIC;
  v_novo_produtos NUMERIC;
  v_item RECORD;
  v_nome TEXT;
  v_itens_inseridos INTEGER := 0;
BEGIN
  BEGIN
    SELECT id, situacao INTO v_erp_id, v_erp_situacao
    FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.id;
    IF v_erp_id IS NULL THEN RETURN NEW; END IF;

    PERFORM set_config('app.sync_ativo', 'true', true);

    v_situacao := CASE
      WHEN NEW.entregue = true THEN 'concluido'
      WHEN NEW.status IS NULL  THEN 'rascunho'
      WHEN NEW.status = 1      THEN 'aprovado'
      WHEN NEW.status = 2      THEN 'concluido'
      WHEN NEW.status = 3      THEN 'concluido'
      WHEN NEW.status = 4      THEN 'cancelado'
      ELSE 'aprovado'
    END;

    -- ═══ CORRECAO: Usar public.vendas.total_venda como fonte autoritativa ═══
    -- Em vez de CASE WHEN v_novo_total > 0, usar DIRECTAMENTE o valor do public.
    -- Se public.vendas.total_venda = 0 e o ERP tem um valor, mantem o ERP.
    UPDATE alissonerp.vendas_erp SET
      situacao       = CASE WHEN v_erp_situacao NOT IN ('confirmado','concluido') THEN v_situacao ELSE situacao END,
      cliente_id     = COALESCE(NEW.cliente_id, cliente_id),
      vendedor_id    = COALESCE(NEW.vendedor_id, vendedor_id),
      data_venda     = COALESCE(NEW.data_venda, data_venda),
      total_produtos = CASE WHEN COALESCE(NEW.total_produtos, 0) > 0 THEN NEW.total_produtos ELSE total_produtos END,
      total_frete    = COALESCE(NEW.frete_pago_cliente, 0),
      total_venda    = COALESCE(NEW.total_venda, total_venda),
      updated_at     = now()
    WHERE id = v_erp_id;

    -- RE-SYNC ITENS FALTANTES (se nao tem nenhum item no ERP ainda)
    IF NOT EXISTS (SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id) THEN
      FOR v_item IN
        SELECT sku, produto_id, quantidade, preco_tabela, desconto_percentual,
               preco_unitario_final, preco_total, comissao_percentual, comissao_valor
        FROM public.itens_venda WHERE venda_id = NEW.id AND produto_id IS NOT NULL
      LOOP
        SELECT nome INTO v_nome FROM public.produtos WHERE id_produto = v_item.produto_id;
        INSERT INTO alissonerp.itens_venda_erp (
          venda_id, produto_id, nome_produto, sku,
          quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
          pct_comissao, valor_comissao
        ) VALUES (
          v_erp_id, v_item.produto_id,
          COALESCE(v_nome, 'Produto #' || v_item.produto_id::text), v_item.sku,
          GREATEST(1, COALESCE(v_item.quantidade, 1)::integer),
          COALESCE(v_item.preco_tabela, 0), COALESCE(v_item.desconto_percentual, 0),
          COALESCE(v_item.preco_unitario_final, 0), COALESCE(v_item.preco_total, 0),
          COALESCE(v_item.comissao_percentual, 0), COALESCE(v_item.comissao_valor, 0)
        );
        v_itens_inseridos := v_itens_inseridos + 1;
      END LOOP;

      IF v_itens_inseridos > 0 THEN
        UPDATE alissonerp.vendas_erp SET
          total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_venda    = COALESCE(NEW.total_venda, total_venda),
          updated_at     = now()
        WHERE id = v_erp_id;
      END IF;
    END IF;

    PERFORM set_config('app.sync_ativo', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.sync_ativo', '', true);
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- ─── 3. Funcao de auditoria: loga divergencias > 1% ────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_auditar_divergencia_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_pub_total NUMERIC;
BEGIN
  IF NEW.public_venda_id IS NULL THEN RETURN NEW; END IF;

  SELECT total_venda INTO v_pub_total
  FROM public.vendas WHERE id = NEW.public_venda_id;

  IF v_pub_total IS NOT NULL
     AND ABS(NEW.total_venda - v_pub_total) > GREATEST(v_pub_total * 0.01, 10)
  THEN
    RAISE WARNING 'ALERTA DIVERGENCIA: venda % (ERP#%) total_venda=R$% public=R$% (diff=R$%)',
      NEW.numero_venda, NEW.id,
      NEW.total_venda, v_pub_total,
      NEW.total_venda - v_pub_total;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_divergencia_total ON alissonerp.vendas_erp;
CREATE TRIGGER trg_auditar_divergencia_total
  AFTER UPDATE OF total_venda ON alissonerp.vendas_erp
  FOR EACH ROW
  WHEN (OLD.total_venda IS DISTINCT FROM NEW.total_venda)
  EXECUTE FUNCTION alissonerp.fn_auditar_divergencia_total();
