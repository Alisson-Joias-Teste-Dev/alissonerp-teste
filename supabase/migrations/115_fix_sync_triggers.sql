-- Migration 115: Corrigir triggers de sync public.vendas → alissonerp.vendas_erp
--
-- Problemas encontrados:
-- 1. UPDATE trigger sobrescreve total_venda=0 quando public é atualizada antes dos itens
-- 2. UPDATE trigger NÃO atualiza total_produtos
-- 3. UPDATE trigger sobrescreve situacao de vendas já fechadas no ERP
-- 4. INSERT trigger cria venda com total=0 (itens não existem ainda)
-- 5. ITEM trigger recalcula comissao mas NÃO recalcula total_produtos/desconto/venda
--
-- Correções:
-- 1. UPDATE trigger: não sobrescrever total_venda para 0 se ERP já tem valor > 0
-- 2. UPDATE trigger: atualizar total_produtos também
-- 3. UPDATE trigger: respeitar vendas fechadas (não mudar situacao se ERP está confirmado/concluido)
-- 4. ITEM trigger: recalcular TODOS os totais (produtos, desconto, comissao, venda)

-- ─── Trigger UPDATE: sync status/totais de public.vendas → ERP ─────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
  v_erp_situacao VARCHAR(20);
  v_novo_total NUMERIC;
  v_novo_produtos NUMERIC;
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

    -- Buscar situacao atual no ERP
    SELECT situacao INTO v_erp_situacao
    FROM alissonerp.vendas_erp
    WHERE public_venda_id = NEW.id;

    -- Se venda no ERP está fechada (confirmado/concluido), NÃO sobrescrever situacao
    -- Apenas atualizar totais se forem maiores que zero
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
      -- Venda fechada: só atualizar totais se novos valores são > 0
      -- NUNCA mudar situacao de venda fechada
      IF v_novo_total > 0 OR v_novo_produtos > 0 THEN
        UPDATE alissonerp.vendas_erp SET
          total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
          total_frete    = COALESCE(NEW.frete_pago_cliente, total_frete),
          total_venda    = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
          updated_at     = now()
        WHERE public_venda_id = NEW.id;
      END IF;
    ELSE
      -- Venda aberta: atualizar tudo, mas não sobrescrever com zero se ERP já tem valor
      UPDATE alissonerp.vendas_erp SET
        situacao       = v_situacao,
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete    = COALESCE(NEW.frete_pago_cliente, 0),
        total_venda    = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at     = now()
      WHERE public_venda_id = NEW.id;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- ─── Trigger ITEM INSERT: sync item + recalcular TODOS os totais ────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_item_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_venda_erp_id INTEGER;
  v_nome_produto TEXT;
BEGIN
  BEGIN
    SELECT id INTO v_venda_erp_id
    FROM alissonerp.vendas_erp
    WHERE public_venda_id = NEW.venda_id;

    IF v_venda_erp_id IS NULL THEN RETURN NEW; END IF;

    -- Idempotente por (venda_id, produto_id, sku)
    IF EXISTS (
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id  = v_venda_erp_id
        AND produto_id = NEW.produto_id
        AND COALESCE(sku, '') = COALESCE(NEW.sku, '')
    ) THEN
      RETURN NEW;
    END IF;

    SELECT nome INTO v_nome_produto
    FROM public.produtos WHERE id_produto = NEW.produto_id;

    INSERT INTO alissonerp.itens_venda_erp (
      venda_id, produto_id, nome_produto, sku,
      quantidade, preco_lista, pct_desconto, preco_unitario, total_item,
      pct_comissao, valor_comissao
    ) VALUES (
      v_venda_erp_id,
      NEW.produto_id,
      COALESCE(v_nome_produto, 'Produto #' || NEW.produto_id::text),
      NEW.sku,
      GREATEST(1, COALESCE(NEW.quantidade, 1)::integer),
      COALESCE(NEW.preco_tabela,          0),
      COALESCE(NEW.desconto_percentual,   0),
      COALESCE(NEW.preco_unitario_final,  0),
      COALESCE(NEW.preco_total,           0),
      COALESCE(NEW.comissao_percentual,   0),
      COALESCE(NEW.comissao_valor,        0)
    );

    -- Recalcular TODOS os totais da venda (não só comissão)
    UPDATE alissonerp.vendas_erp SET
      total_produtos = COALESCE((
        SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_desconto = COALESCE((
        SELECT SUM((preco_lista - preco_unitario) * quantidade)
        FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_comissao = COALESCE((
        SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0),
      total_venda = COALESCE((
        SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
      ), 0) + COALESCE(total_frete, 0),
      updated_at = now()
    WHERE id = v_venda_erp_id;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
