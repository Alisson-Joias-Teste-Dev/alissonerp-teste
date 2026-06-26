-- =====================================================================
-- Migration 246: Fix vw_dash_vendas_todas — incluir 'confirmado' e 'entregue'
-- =====================================================================
-- Bug: a view só incluía situacao IN ('aprovado', 'enviado', 'concluido'),
-- mas a máquina de estados do ERP (migration 178) tem dois estados válidos
-- adicionais: 'confirmado' (pagamento confirmado, aguardando envio) e
-- 'entregue' (mercadoria entregue, antes de ser marcada como concluida).
-- Vendas nesses estados ficavam invisíveis no dashboard comercial.
-- =====================================================================

CREATE OR REPLACE VIEW alissonerp.vw_dash_vendas_todas AS

-- ── LEGADO: sistema antigo (public.vendas) ──────────────────────────
SELECT
  'legado'::text                                      AS fonte,
  v.id::bigint                                        AS id,
  v.data_venda,
  v.status,
  v.vendedor_id::bigint                               AS vendedor_id,
  v.cliente_id::bigint                                AS cliente_id,
  v.total_venda,
  v.frete_pago_cliente,
  v.forma_envio_id::integer                           AS forma_envio_id,
  v.numero_pedido::bigint                             AS numero_pedido,
  v.numero_pedido_tiny,
  v.id_api_tiny::bigint                               AS id_api_tiny,
  v.entregue,
  NULL::text                                          AS forma_envio_texto,
  COALESCE((
    SELECT SUM(p.valor)
    FROM public.parcelas_pedidos p
    WHERE p.pedido_id_api = v.id_api_tiny
      AND p.forma_pagamento = 'Vale-troca'
  ), 0)::numeric                                      AS valor_vale_troca

FROM public.vendas v
WHERE NOT EXISTS (
  -- Exclui se ERP aprovado >= cutoff tem o mesmo tiny_pedido_id
  SELECT 1 FROM alissonerp.vendas_erp ve
  WHERE ve.situacao IN ('aprovado', 'confirmado', 'enviado', 'entregue', 'concluido')
    AND ve.tiny_pedido_id IS NOT NULL
    AND ve.tiny_pedido_id = v.id_api_tiny
    AND ve.data_venda >= '2026-04-23'
)
AND NOT EXISTS (
  -- Exclui se ERP aprovado pré-cutoff sem tiny cobre o mesmo numero_venda e legado está pendente
  SELECT 1 FROM alissonerp.vendas_erp ve2
  WHERE ve2.situacao IN ('aprovado', 'confirmado', 'enviado', 'entregue', 'concluido')
    AND ve2.tiny_pedido_id IS NULL
    AND ve2.numero_venda = v.numero_pedido::text
    AND ve2.data_venda < '2026-04-23'
    AND v.status != 2
)
AND NOT EXISTS (
  -- Exclui se ERP aprovado pré-cutoff com tiny cobre o mesmo tiny_pedido_id e legado está pendente
  SELECT 1 FROM alissonerp.vendas_erp ve3
  WHERE ve3.situacao IN ('aprovado', 'confirmado', 'enviado', 'entregue', 'concluido')
    AND ve3.tiny_pedido_id IS NOT NULL
    AND ve3.tiny_pedido_id = v.id_api_tiny
    AND ve3.data_venda < '2026-04-23'
    AND v.status IS DISTINCT FROM 2
)

UNION ALL

-- ── ERP: fabricaAJ (alissonerp.vendas_erp) ─────────────────────────
SELECT
  'erp'::text                                         AS fonte,
  ve.id::bigint                                       AS id,
  ve.data_venda,
  2::integer                                          AS status,
  ve.vendedor_id::bigint                              AS vendedor_id,
  ve.cliente_id::bigint                               AS cliente_id,
  ve.total_venda,
  ve.total_frete                                      AS frete_pago_cliente,
  NULL::integer                                       AS forma_envio_id,
  NULL::bigint                                        AS numero_pedido,
  COALESCE(ve.tiny_pedido_id::text, ve.numero_venda) AS numero_pedido_tiny,
  ve.tiny_pedido_id::bigint                           AS id_api_tiny,
  false                                               AS entregue,
  ve.forma_envio                                      AS forma_envio_texto,
  COALESCE((
    SELECT SUM(pv.valor)
    FROM alissonerp.pagamentos_venda pv
    WHERE pv.venda_id = ve.id
      AND pv.forma = 'Vale-troca'
      AND pv.status = 'confirmado'
  ), 0)::numeric                                      AS valor_vale_troca

FROM alissonerp.vendas_erp ve
WHERE ve.situacao IN ('aprovado', 'confirmado', 'enviado', 'entregue', 'concluido')
  AND (
    -- Novos: a partir do cutoff, sempre incluir
    ve.data_venda >= '2026-04-23'
    OR (
      -- Pré-cutoff sem tiny: pedido interno, legado pendente
      ve.data_venda < '2026-04-23'
      AND ve.tiny_pedido_id IS NULL
      AND ve.total_venda > 0
      AND EXISTS (
        SELECT 1 FROM public.vendas v2
        WHERE v2.numero_pedido::text = ve.numero_venda
          AND v2.status != 2
      )
    )
    OR (
      -- Pré-cutoff com tiny: incluir se legado correspondente não está aprovado
      ve.data_venda < '2026-04-23'
      AND ve.tiny_pedido_id IS NOT NULL
      AND ve.total_venda > 0
      AND EXISTS (
        SELECT 1 FROM public.vendas v3
        WHERE v3.id_api_tiny = ve.tiny_pedido_id
          AND v3.status IS DISTINCT FROM 2
      )
    )
  )
;

GRANT SELECT ON alissonerp.vw_dash_vendas_todas TO anon, authenticated, service_role;

COMMENT ON VIEW alissonerp.vw_dash_vendas_todas IS
  'Dashboard Comercial: vendas unificadas legado (public.vendas) + ERP (vendas_erp). '
  'ERP inclui situacao aprovado/confirmado/enviado/entregue/concluido. '
  'ERP inclui >= 2026-04-23 e pré-cutoff sem duplicata aprovada no legado. '
  'valor_vale_troca pré-computado por fonte.';
