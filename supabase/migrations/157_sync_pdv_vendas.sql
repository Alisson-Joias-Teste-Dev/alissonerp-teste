-- ============================================================
-- Migration 157 — Sync public.vendas → alissonerp.vendas_erp
--
-- Importa pedidos PDV (Tiny ERP) que ainda não existem no ERP.
--
-- Passo 1: INSERT para pedidos cujo numero_pedido não conflita
-- Passo 2: UPDATE em entradas manuais (sem public_venda_id) com
--          mesmo número — ex: teste "14946 jonathan" → real Bismack
-- Passo 3: Atualizar trigger para usar numero_pedido diretamente
-- ============================================================

-- ─── Passo 1: Inserir PDV sem conflito de numero_venda ────────────────────────
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
  v.numero_pedido::text             AS numero_venda,
  v.cliente_id,
  v.vendedor_id,
  v.data_venda,
  v.data_envio::date                AS data_entrega,
  COALESCE(v.total_produtos, 0),
  0                                 AS total_desconto,
  COALESCE(v.frete_pago_cliente, 0) AS total_frete,
  COALESCE(v.total_venda, 0),
  0                                 AS total_comissao,
  CASE
    WHEN v.entregue = true  THEN 'concluido'
    WHEN v.status IS NULL   THEN 'rascunho'
    WHEN v.status = 1       THEN 'aprovado'
    WHEN v.status IN (2, 3) THEN 'concluido'
    WHEN v.status = 4       THEN 'cancelado'
    ELSE 'aprovado'
  END                               AS situacao,
  v.observacoes,
  v.observacoes_internas,
  v.id_api_tiny                     AS tiny_pedido_id,
  v.id                              AS public_venda_id,
  false                             AS bloqueado,
  COALESCE(v.created_at, now()),
  now()
FROM public.vendas v
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp e WHERE e.public_venda_id = v.id
)
  AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp e WHERE e.numero_venda = v.numero_pedido::text
)
ON CONFLICT DO NOTHING;

-- ─── Passo 2: Atualizar entradas manuais (sem public_venda_id) com número igual ──
-- Substitui dados do teste pelo pedido real do PDV.
-- Ex: 14946 "jonathan teste" → 14946 "Bismack Bruno Alves Do Vale"
UPDATE alissonerp.vendas_erp e
SET
  public_venda_id = v.id,
  cliente_id      = v.cliente_id,
  vendedor_id     = v.vendedor_id,
  data_venda      = v.data_venda,
  total_produtos  = COALESCE(v.total_produtos, 0),
  total_frete     = COALESCE(v.frete_pago_cliente, 0),
  total_venda     = COALESCE(v.total_venda, 0),
  situacao        = CASE
    WHEN v.entregue = true  THEN 'concluido'
    WHEN v.status IS NULL   THEN 'rascunho'
    WHEN v.status = 1       THEN 'aprovado'
    WHEN v.status IN (2, 3) THEN 'concluido'
    WHEN v.status = 4       THEN 'cancelado'
    ELSE 'aprovado'
  END,
  updated_at      = now()
FROM public.vendas v
WHERE e.numero_venda      = v.numero_pedido::text
  AND e.public_venda_id   IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.vendas_erp e2 WHERE e2.public_venda_id = v.id
  );

-- ─── Passo 3: Atualizar trigger para usar numero_pedido diretamente ───────────
-- Substitui prefixo PV-XXXXXX pelo número real do pedido Tiny.
CREATE OR REPLACE FUNCTION alissonerp.fn_sync_venda_from_public()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_situacao VARCHAR(20);
BEGIN
  IF EXISTS (
    SELECT 1 FROM alissonerp.vendas_erp WHERE public_venda_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  v_situacao := CASE
    WHEN NEW.entregue = true THEN 'concluido'
    WHEN NEW.status IS NULL  THEN 'rascunho'
    WHEN NEW.status = 1      THEN 'aprovado'
    WHEN NEW.status IN (2,3) THEN 'concluido'
    WHEN NEW.status = 4      THEN 'cancelado'
    ELSE                          'aprovado'
  END;

  INSERT INTO alissonerp.vendas_erp (
    numero_venda, cliente_id, vendedor_id,
    data_venda, data_entrega,
    total_produtos, total_frete, total_venda,
    situacao, observacoes, observacoes_internas,
    tiny_pedido_id, public_venda_id,
    bloqueado, created_at, updated_at
  ) VALUES (
    NEW.numero_pedido::text,
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
  )
  -- Se o número já existe como entrada manual (sem public_venda_id), sobrescreve
  ON CONFLICT (numero_venda) DO UPDATE SET
    public_venda_id = EXCLUDED.public_venda_id,
    cliente_id      = EXCLUDED.cliente_id,
    vendedor_id     = EXCLUDED.vendedor_id,
    data_venda      = EXCLUDED.data_venda,
    total_produtos  = EXCLUDED.total_produtos,
    total_frete     = EXCLUDED.total_frete,
    total_venda     = EXCLUDED.total_venda,
    situacao        = EXCLUDED.situacao,
    updated_at      = now()
  WHERE alissonerp.vendas_erp.public_venda_id IS NULL;

  RETURN NEW;
END;
$$;
