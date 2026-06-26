-- ============================================================
-- Migration 109 — Sincronização public.vendas → alissonerp.vendas_erp
--
-- 1. Adiciona coluna public_venda_id em vendas_erp (rastreio de origem)
-- 2. Migra dados históricos (14.301 vendas + 75.956 itens)
-- 3. Recalcula total_desconto e total_comissao
-- 4. Cria triggers para sync automático de novas vendas
-- ============================================================

-- ─── 1. Coluna de rastreio de origem ────────────────────────────────────────
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS public_venda_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendas_erp_public_venda_id
  ON alissonerp.vendas_erp (public_venda_id)
  WHERE public_venda_id IS NOT NULL;

-- ─── 2. Mapeamento de status ─────────────────────────────────────────────────
-- public.vendas.status: NULL=rascunho, 1=aprovado, 2=concluido, 3=concluido, 4=cancelado
-- entregue=true → concluido (sobrescreve)

-- ─── 3. Migração histórica — vendas ─────────────────────────────────────────
INSERT INTO alissonerp.vendas_erp (
  numero_venda,
  cliente_id,
  vendedor_id,
  data_venda,
  data_entrega,
  total_produtos,
  total_desconto,
  total_frete,
  total_venda,
  total_comissao,
  situacao,
  observacoes,
  observacoes_internas,
  tiny_pedido_id,
  public_venda_id,
  bloqueado,
  created_at,
  updated_at
)
SELECT
  'PV-' || LPAD(v.id::text, 6, '0')       AS numero_venda,
  v.cliente_id,
  v.vendedor_id,
  v.data_venda,
  v.data_envio::date                        AS data_entrega,
  COALESCE(v.total_produtos,  0),
  0                                         AS total_desconto,   -- recalculado abaixo
  COALESCE(v.frete_pago_cliente, 0)         AS total_frete,
  COALESCE(v.total_venda,     0),
  0                                         AS total_comissao,   -- recalculado abaixo
  CASE
    WHEN v.entregue = true  THEN 'concluido'
    WHEN v.status IS NULL   THEN 'rascunho'
    WHEN v.status = 1       THEN 'aprovado'
    WHEN v.status = 2       THEN 'concluido'
    WHEN v.status = 3       THEN 'concluido'
    WHEN v.status = 4       THEN 'cancelado'
    ELSE                         'aprovado'
  END                                       AS situacao,
  v.observacoes,
  v.observacoes_internas,
  v.id_api_tiny                             AS tiny_pedido_id,
  v.id                                      AS public_venda_id,
  false                                     AS bloqueado,
  COALESCE(v.created_at, now()),
  COALESCE(v.updated_at::timestamptz, now())
FROM public.vendas v
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp e WHERE e.public_venda_id = v.id
)
ON CONFLICT DO NOTHING;

-- ─── 4. Migração histórica — itens ──────────────────────────────────────────
INSERT INTO alissonerp.itens_venda_erp (
  venda_id,
  produto_id,
  nome_produto,
  sku,
  quantidade,
  preco_lista,
  pct_desconto,
  preco_unitario,
  total_item,
  pct_comissao,
  valor_comissao,
  created_at
)
SELECT
  e.id                                                           AS venda_id,
  i.produto_id,
  COALESCE(p.nome, 'Produto #' || i.produto_id::text)           AS nome_produto,
  i.sku,
  GREATEST(1, COALESCE(i.quantidade, 1)::integer)               AS quantidade,
  COALESCE(i.preco_tabela,           0)                         AS preco_lista,
  COALESCE(i.desconto_percentual,    0)                         AS pct_desconto,
  COALESCE(i.preco_unitario_final,   0)                         AS preco_unitario,
  COALESCE(i.preco_total,            0)                         AS total_item,
  COALESCE(i.comissao_percentual,    0)                         AS pct_comissao,
  COALESCE(i.comissao_valor,         0)                         AS valor_comissao,
  now()                                                          AS created_at
FROM public.itens_venda i
JOIN alissonerp.vendas_erp e
  ON e.public_venda_id = i.venda_id
LEFT JOIN public.produtos p
  ON p.id_produto = i.produto_id
WHERE i.produto_id IS NOT NULL               -- ignora itens sem produto
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.itens_venda_erp ei
    WHERE ei.venda_id = e.id
      AND ei.produto_id = i.produto_id
      AND COALESCE(ei.sku, '') = COALESCE(i.sku, '')
  );

-- ─── 5. Recalcular total_desconto e total_comissao nas vendas migradas ───────
UPDATE alissonerp.vendas_erp e
SET
  total_desconto = COALESCE((
    SELECT SUM(
      (preco_lista - preco_unitario) * quantidade
    )
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = e.id
  ), 0),
  total_comissao = COALESCE((
    SELECT SUM(valor_comissao)
    FROM alissonerp.itens_venda_erp
    WHERE venda_id = e.id
  ), 0)
WHERE e.public_venda_id IS NOT NULL;

-- ─── 6. Função trigger: nova venda em public.vendas → sync ──────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao    VARCHAR(20);
  v_numero      TEXT;
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

  v_numero := 'PV-' || LPAD(NEW.id::text, 6, '0');

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

  RETURN NEW;
END;
$$;

-- ─── 7. Função trigger: status atualizado em public.vendas → sync ────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_update_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
BEGIN
  -- Só atualiza campos relevantes (status, entregue, totais)
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

  RETURN NEW;
END;
$$;

-- ─── 8. Função trigger: novo item em public.itens_venda → sync ───────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_item_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_venda_erp_id INTEGER;
  v_nome_produto TEXT;
BEGIN
  SELECT id INTO v_venda_erp_id
  FROM alissonerp.vendas_erp
  WHERE public_venda_id = NEW.venda_id;

  IF v_venda_erp_id IS NULL THEN RETURN NEW; END IF;

  -- Idempotente por (venda_id, produto_id, sku)
  IF EXISTS (
    SELECT 1 FROM alissonerp.itens_venda_erp
    WHERE venda_id = v_venda_erp_id
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

  -- Recalcular totais da venda
  UPDATE alissonerp.vendas_erp SET
    total_comissao = COALESCE((
      SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = v_venda_erp_id
    ), 0),
    updated_at = now()
  WHERE id = v_venda_erp_id;

  RETURN NEW;
END;
$$;

-- ─── 9. Criar os triggers ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_venda_insert_from_public ON public.vendas;
CREATE TRIGGER trg_sync_venda_insert_from_public
  AFTER INSERT ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_venda_from_public();

DROP TRIGGER IF EXISTS trg_sync_venda_update_from_public ON public.vendas;
CREATE TRIGGER trg_sync_venda_update_from_public
  AFTER UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_venda_update_from_public();

DROP TRIGGER IF EXISTS trg_sync_item_venda_insert_from_public ON public.itens_venda;
CREATE TRIGGER trg_sync_item_venda_insert_from_public
  AFTER INSERT ON public.itens_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_sync_item_venda_from_public();

-- ─── 10. Grant na nova coluna ────────────────────────────────────────────────
-- (vendas_erp já tem grants — nada extra necessário)
