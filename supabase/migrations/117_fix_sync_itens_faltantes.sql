-- Migration 117: Fix sync itens faltantes
-- Problema: trigger de item só funciona se a venda ERP já existe no momento do INSERT.
-- Se itens são inseridos antes/junto com a venda, o trigger pula silenciosamente.
-- Solução: no trigger UPDATE da venda, re-sincronizar itens faltantes.

-- ─── Trigger UPDATE melhorado: após sync de status, verifica e insere itens faltantes ──
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
    -- Só reagir a mudanças relevantes
    IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.entregue IS NOT DISTINCT FROM OLD.entregue
    AND NEW.total_venda IS NOT DISTINCT FROM OLD.total_venda
    AND NEW.total_produtos IS NOT DISTINCT FROM OLD.total_produtos
    AND NEW.frete_pago_cliente IS NOT DISTINCT FROM OLD.frete_pago_cliente
    THEN
      RETURN NEW;
    END IF;

    -- Buscar venda ERP
    SELECT id, situacao INTO v_erp_id, v_erp_situacao
    FROM alissonerp.vendas_erp
    WHERE public_venda_id = NEW.id;

    IF v_erp_id IS NULL THEN RETURN NEW; END IF;

    v_situacao := CASE
      WHEN NEW.entregue = true THEN 'concluido'
      WHEN NEW.status IS NULL  THEN 'rascunho'
      WHEN NEW.status = 1      THEN 'aprovado'
      WHEN NEW.status = 2      THEN 'concluido'
      WHEN NEW.status = 3      THEN 'concluido'
      WHEN NEW.status = 4      THEN 'cancelado'
      ELSE                          'aprovado'
    END;

    v_novo_total := COALESCE(NEW.total_venda, 0);
    v_novo_produtos := COALESCE(NEW.total_produtos, 0);

    IF v_erp_situacao IN ('confirmado', 'concluido') THEN
      -- Venda fechada: só atualizar totais se novos > 0
      IF v_novo_total > 0 OR v_novo_produtos > 0 THEN
        UPDATE alissonerp.vendas_erp SET
          total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
          total_frete    = COALESCE(NEW.frete_pago_cliente, total_frete),
          total_venda    = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
          updated_at     = now()
        WHERE id = v_erp_id;
      END IF;
    ELSE
      UPDATE alissonerp.vendas_erp SET
        situacao       = v_situacao,
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete    = COALESCE(NEW.frete_pago_cliente, 0),
        total_venda    = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at     = now()
      WHERE id = v_erp_id;
    END IF;

    -- ═══ RE-SYNC ITENS FALTANTES ═══
    -- Se a venda ERP não tem itens mas a public tem, sincronizar agora
    IF NOT EXISTS (SELECT 1 FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id) THEN
      FOR v_item IN
        SELECT sku, produto_id, quantidade, preco_tabela, desconto_percentual,
               preco_unitario_final, preco_total, comissao_percentual, comissao_valor
        FROM public.itens_venda
        WHERE venda_id = NEW.id AND produto_id IS NOT NULL
      LOOP
        SELECT nome INTO v_nome FROM public.produtos WHERE id_produto = v_item.produto_id;

        INSERT INTO alissonerp.itens_venda_erp (
          venda_id, produto_id, nome_produto, sku,
          quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
          pct_comissao, valor_comissao
        ) VALUES (
          v_erp_id,
          v_item.produto_id,
          COALESCE(v_nome, 'Produto #' || v_item.produto_id::text),
          v_item.sku,
          GREATEST(1, COALESCE(v_item.quantidade, 1)::integer),
          COALESCE(v_item.preco_tabela, 0),
          COALESCE(v_item.desconto_percentual, 0),
          COALESCE(v_item.preco_unitario_final, 0),
          COALESCE(v_item.preco_total, 0),
          COALESCE(v_item.comissao_percentual, 0),
          COALESCE(v_item.comissao_valor, 0)
        );
        v_itens_inseridos := v_itens_inseridos + 1;
      END LOOP;

      -- Se inseriu itens, recalcular totais
      IF v_itens_inseridos > 0 THEN
        UPDATE alissonerp.vendas_erp SET
          total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0),
          total_venda = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0) + COALESCE(total_frete, 0),
          updated_at = now()
        WHERE id = v_erp_id;
      END IF;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
