-- Rollback: definicao da view vw_dash_vendas_todas ANTES da migration 304
-- Capturado em produciao por claude-code (autorizado por Jonathan)
CREATE OR REPLACE VIEW alissonerp.vw_dash_vendas_todas AS
 SELECT 'legado'::text AS fonte,
    v.id::bigint AS id,
    v.data_venda,
    v.status,
    v.vendedor_id::bigint AS vendedor_id,
    v.cliente_id::bigint AS cliente_id,
    v.total_venda,
    v.frete_pago_cliente,
    v.forma_envio_id,
    v.numero_pedido,
    v.numero_pedido_tiny,
    v.id_api_tiny,
    v.entregue,
    NULL::text AS forma_envio_texto,
    COALESCE(( SELECT sum(p.valor) AS sum
           FROM parcelas_pedidos p
          WHERE p.pedido_id_api = v.id_api_tiny AND p.forma_pagamento = 'Vale-troca'::text), 0::double precision)::numeric AS valor_vale_troca,
    false AS em_rota
   FROM vendas v
  WHERE NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve
          WHERE (ve.situacao::text = ANY (ARRAY['aprovado'::character varying::text, 'em_rota'::character varying::text, 'enviado'::character varying::text, 'entregue'::character varying::text, 'concluido'::character varying::text])) AND ve.tiny_pedido_id IS NOT NULL AND ve.tiny_pedido_id = v.id_api_tiny AND ve.data_venda >= '2026-04-23'::date)) AND NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve2
          WHERE (ve2.situacao::text = ANY (ARRAY['aprovado'::character varying::text, 'em_rota'::character varying::text, 'enviado'::character varying::text, 'entregue'::character varying::text, 'concluido'::character varying::text])) AND ve2.tiny_pedido_id IS NULL AND ve2.numero_venda = v.numero_pedido::text AND ve2.data_venda < '2026-04-23'::date AND v.status <> 2)) AND NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve3
          WHERE (ve3.situacao::text = ANY (ARRAY['aprovado'::character varying::text, 'em_rota'::character varying::text, 'enviado'::character varying::text, 'entregue'::character varying::text, 'concluido'::character varying::text])) AND ve3.tiny_pedido_id IS NOT NULL AND ve3.tiny_pedido_id = v.id_api_tiny AND ve3.data_venda < '2026-04-23'::date AND v.status IS DISTINCT FROM 2))
UNION ALL
 SELECT 'erp'::text AS fonte,
    ve.id::bigint AS id,
    ve.data_venda,
    2 AS status,
    ve.vendedor_id,
    ve.cliente_id,
    ve.total_venda,
    ve.total_frete AS frete_pago_cliente,
    NULL::integer AS forma_envio_id,
    NULL::bigint AS numero_pedido,
    COALESCE(ve.tiny_pedido_id::text, ve.numero_venda) AS numero_pedido_tiny,
    ve.tiny_pedido_id AS id_api_tiny,
    false AS entregue,
    ve.forma_envio AS forma_envio_texto,
    COALESCE(( SELECT sum(pv.valor) AS sum
           FROM alissonerp.pagamentos_venda pv
          WHERE pv.venda_id = ve.id AND pv.forma::text = 'Vale-Troca'::text AND pv.status::text = 'confirmado'::text), 0::numeric) AS valor_vale_troca,
    ve.situacao::text = 'em_rota'::text AS em_rota
   FROM alissonerp.vendas_erp ve
  WHERE (ve.situacao::text = ANY (ARRAY['aprovado'::character varying::text, 'em_rota'::character varying::text, 'enviado'::character varying::text, 'entregue'::character varying::text, 'concluido'::character varying::text])) AND (ve.data_venda >= '2026-04-23'::date OR ve.data_venda < '2026-04-23'::date AND ve.tiny_pedido_id IS NULL AND ve.total_venda > 0::numeric AND (EXISTS ( SELECT 1
           FROM vendas v2
          WHERE v2.numero_pedido::text = ve.numero_venda AND v2.status <> 2)) OR ve.data_venda < '2026-04-23'::date AND ve.tiny_pedido_id IS NOT NULL AND ve.total_venda > 0::numeric AND (EXISTS ( SELECT 1
           FROM vendas v3
          WHERE v3.id_api_tiny = ve.tiny_pedido_id AND v3.status IS DISTINCT FROM 2)));
GRANT SELECT ON alissonerp.vw_dash_vendas_todas TO anon, authenticated, service_role;
