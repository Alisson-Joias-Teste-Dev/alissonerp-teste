-- =====================================================================
-- Migration 176: Dashboard Comercial — Unificação ERP + Legado
-- =====================================================================
-- Cria vw_dash_vendas_todas: UNION de public.vendas (legado Evolury)
-- com alissonerp.vendas_erp (ERP fabricaAJ, a partir de abr/2026).
--
-- Motivação: a partir de quarta-feira 23/04/2026 o fabricaAJ é o
-- sistema principal de vendas. As APIs do dashboard precisam somar
-- ambas as fontes para mostrar o faturamento completo.
--
-- Inclui valor_vale_troca pré-computado por fonte:
--   legado → public.parcelas_pedidos (forma_pagamento = 'Vale-troca')
--   erp    → alissonerp.pagamentos_venda (forma = 'Vale-troca', confirmado)
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
-- Exclui entradas que já existem no ERP (evita dupla contagem quando Tiny sincroniza de volta)
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve
  WHERE ve.tiny_pedido_id = v.id_api_tiny
    AND ve.situacao IN ('aprovado', 'enviado', 'concluido')
    AND ve.tiny_pedido_id IS NOT NULL
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
WHERE ve.situacao IN ('aprovado', 'enviado', 'concluido')
;

GRANT SELECT ON alissonerp.vw_dash_vendas_todas TO anon, authenticated, service_role;

COMMENT ON VIEW alissonerp.vw_dash_vendas_todas IS
  'Dashboard Comercial: vendas unificadas legado (public.vendas) + ERP (vendas_erp). '
  'valor_vale_troca pré-computado por fonte. ERP inclui situacao aprovado/enviado/concluido.';
