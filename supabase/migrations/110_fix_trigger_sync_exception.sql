-- ============================================================
-- Migration 110 — Fix triggers sync public.vendas → alissonerp
--
-- Problema: trigger sem EXCEPTION handler quebrava transações
-- do sistema externo quando o INSERT em vendas_erp falhava.
--
-- Solução: EXCEPTION WHEN OTHERS THEN NULL em todas as funções.
-- O sync é "best-effort" — NUNCA pode bloquear o sistema principal.
-- ============================================================

-- ─── Trigger: INSERT em public.vendas ───────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
  v_numero   TEXT;
BEGIN
  BEGIN
    -- Idempotente: já existe?
    IF EXISTS (
      SELECT 1 FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    v_situacao := CASE
      WHEN NEW.entregue = true THEN 'concluido'
      WHEN NEW.status IS NULL  THEN 'rascunho'
      WHEN NEW.status = 1      THEN 'aprovado'
      WHEN NEW.status = 2      THEN 'concluido'
      WHEN NEW.status = 3      THEN 'concluido'
      WHEN NEW.status = 4      THEN 'cancelado'
      ELSE                          'aprovado'
    END;

    v_numero := COALESCE(NEW.numero_pedido::text, 'PV-' || LPAD(NEW.id::text, 6, '0'));

    INSERT INTO alissonerp.vendas_erp (
      numero_venda, cliente_id, vendedor_id,
      data_venda, data_entrega,
      total_produtos, total_frete, total_venda,
      situacao, observacoes, observacoes_internas,
      tiny_pedido_id, public_venda_id,
      bloqueado, created_at, updated_at
    ) VALUES (
      v_numero,
      NEW.cliente_id,
      NEW.vendedor_id,
      NEW.data_venda,
      NEW.data_envio::date,
      COALESCE(NEW.total_produtos,     0),
      COALESCE(NEW.frete_pago_cliente, 0),
      COALESCE(NEW.total_venda,        0),
      v_situacao,
      NEW.observacoes,
      NEW.observacoes_internas,
      NEW.id_api_tiny,
      NEW.id,
      false,
      COALESCE(NEW.created_at, now()),
      now()
    ) ON CONFLICT DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Sync falhou silenciosamente — NUNCA bloqueia o sistema externo
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- ─── Trigger: UPDATE em public.vendas ───────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
BEGIN
  BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.entregue IS NOT DISTINCT FROM OLD.entregue
    AND NEW.total_venda IS NOT DISTINCT FROM OLD.total_venda
    AND NEW.frete_pago_cliente IS NOT DISTINCT FROM OLD.frete_pago_cliente
    THEN
      RETURN NEW;
    END IF;

    v_situacao := CASE
      WHEN NEW.entregue = true THEN 'concluido'
      WHEN NEW.status IS NULL  THEN 'rascunho'
      WHEN NEW.status = 1      THEN 'aprovado'
      WHEN NEW.status = 2      THEN 'concluido'
      WHEN NEW.status = 3      THEN 'concluido'
      WHEN NEW.status = 4      THEN 'cancelado'
      ELSE                          'aprovado'
    END;

    UPDATE alissonerp.vendas_erp SET
      situacao    = v_situacao,
      total_frete = COALESCE(NEW.frete_pago_cliente, 0),
      total_venda = COALESCE(NEW.total_venda, 0),
      updated_at  = now()
    WHERE public_venda_id = NEW.id;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- ─── Trigger: INSERT em public.itens_venda ───────────────────────────────────
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

    UPDATE alissonerp.vendas_erp SET
      total_comissao = COALESCE((
        SELECT SUM(valor_comissao)
        FROM alissonerp.itens_venda_erp
        WHERE venda_id = v_venda_erp_id
      ), 0),
      updated_at = now()
    WHERE id = v_venda_erp_id;

  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;
