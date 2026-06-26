-- Migration 118: Sync triggers bypass blindagem via session variable
-- Problema: trigger sync tenta atualizar vendas fechadas mas blindagem bloqueia
-- Solução: set_config('app.sync_ativo','true',true) — blindagem verifica e permite

-- 1. Blindagem vendas: bypass quando sync ativo
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_venda_fechada()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN RETURN NEW; END IF;
  IF OLD.situacao NOT IN ('confirmado', 'concluido') THEN RETURN NEW; END IF;

  IF NEW.total_produtos IS DISTINCT FROM OLD.total_produtos
     OR NEW.total_desconto IS DISTINCT FROM OLD.total_desconto
     OR NEW.total_venda IS DISTINCT FROM OLD.total_venda
     OR NEW.total_comissao IS DISTINCT FROM OLD.total_comissao
     OR NEW.total_frete IS DISTINCT FROM OLD.total_frete
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
     OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
  THEN
    RAISE EXCEPTION 'Venda fechada (%). Campos financeiros protegidos.', OLD.situacao
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Blindagem itens: bypass quando sync ativo
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
RETURNS TRIGGER AS $$
DECLARE v_situacao TEXT;
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  IF v_situacao IN ('confirmado', 'concluido') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Sync UPDATE: setar bypass antes de operar
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20); v_erp_id INTEGER; v_erp_situacao VARCHAR(20);
  v_novo_total NUMERIC; v_novo_produtos NUMERIC;
  v_item RECORD; v_nome TEXT; v_itens_inseridos INTEGER := 0;
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

    v_novo_total := COALESCE(NEW.total_venda, 0);
    v_novo_produtos := COALESCE(NEW.total_produtos, 0);

    IF v_erp_situacao IN ('confirmado', 'concluido') THEN
      UPDATE alissonerp.vendas_erp SET
        cliente_id = COALESCE(NEW.cliente_id, cliente_id),
        vendedor_id = COALESCE(NEW.vendedor_id, vendedor_id),
        data_venda = COALESCE(NEW.data_venda, data_venda),
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete = COALESCE(NEW.frete_pago_cliente, total_frete),
        total_venda = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at = now()
      WHERE id = v_erp_id;
    ELSE
      UPDATE alissonerp.vendas_erp SET
        situacao = v_situacao,
        cliente_id = COALESCE(NEW.cliente_id, cliente_id),
        vendedor_id = COALESCE(NEW.vendedor_id, vendedor_id),
        data_venda = COALESCE(NEW.data_venda, data_venda),
        total_produtos = CASE WHEN v_novo_produtos > 0 THEN v_novo_produtos ELSE total_produtos END,
        total_frete = COALESCE(NEW.frete_pago_cliente, 0),
        total_venda = CASE WHEN v_novo_total > 0 THEN v_novo_total ELSE total_venda END,
        updated_at = now()
      WHERE id = v_erp_id;
    END IF;

    -- RE-SYNC ITENS FALTANTES
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
          total_venda = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_erp_id), 0) + COALESCE(total_frete, 0),
          updated_at = now()
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

-- 4. Sync item: setar bypass
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_item_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_venda_erp_id INTEGER; v_nome_produto TEXT;
BEGIN
  BEGIN
    SELECT id INTO v_venda_erp_id FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.venda_id;
    IF v_venda_erp_id IS NULL THEN RETURN NEW; END IF;
    IF EXISTS (
      SELECT 1 FROM alissonerp.itens_venda_erp
      WHERE venda_id = v_venda_erp_id AND produto_id = NEW.produto_id AND COALESCE(sku, '') = COALESCE(NEW.sku, '')
    ) THEN RETURN NEW; END IF;

    PERFORM set_config('app.sync_ativo', 'true', true);

    SELECT nome INTO v_nome_produto FROM public.produtos WHERE id_produto = NEW.produto_id;

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

    UPDATE alissonerp.vendas_erp SET
      total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0),
      total_venda = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id), 0) + COALESCE(total_frete, 0),
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
