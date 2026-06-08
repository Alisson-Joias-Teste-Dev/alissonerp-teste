-- Migration 290: Status "em_rota" para venda com entrega via motoboy
--
-- REGRA DE NEGÓCIO: quando o motoboy retira a mercadoria (Código B), a entrega
-- fica "em_rota" e a venda também muda para "em_rota". Isso permite que a
-- dashboard comercial exiba vendas que estão fisicamente com o motoboy,
-- diferenciando de vendas "aprovado" que ainda estão na loja.
--
-- IMPACTO SE REMOVIDO: vendas em trânsito somem da dashboard comercial.

SET search_path TO alissonerp, directus, public;

-- 1. Permitir transição aprovado → em_rota
CREATE OR REPLACE FUNCTION alissonerp.fn_registrar_transicao_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_de   VARCHAR(30) := OLD.situacao;
  v_para VARCHAR(30) := NEW.situacao;
  v_ok   BOOLEAN;
BEGIN
  IF v_de IS NOT DISTINCT FROM v_para THEN
    RETURN NEW;
  END IF;

  IF v_de IS NULL THEN
    v_ok := v_para = ANY(ARRAY['rascunho','aprovado','confirmado','cancelado']);
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado']);
  ELSIF v_de = 'aprovado' THEN
    -- aprovado → enviado, em_rota, entregue, concluido ou cancelado
    v_ok := v_para = ANY(ARRAY['enviado','em_rota','entregue','concluido','cancelado']);
  ELSIF v_de = 'em_rota' THEN
    -- em_rota → entregue, concluido ou cancelado
    v_ok := v_para = ANY(ARRAY['entregue','concluido','cancelado']);
  ELSIF v_de = 'confirmado' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','enviado','em_rota','entregue','concluido','cancelado']);
  ELSIF v_de = 'enviado' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de = 'entregue' THEN
    v_ok := v_para = ANY(ARRAY['concluido']);
  ELSIF v_de IN ('concluido','cancelado') THEN
    v_ok := false;
  ELSE
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transição inválida: % → %', COALESCE(v_de, 'NULL'), v_para;
  END IF;

  INSERT INTO alissonerp.vendas_transicoes
    (venda_id, de_situacao, para_situacao, created_at)
  VALUES (NEW.id, v_de, v_para, now());

  RETURN NEW;
END;
$$;

-- 2. Incluir "em_rota" na view da dashboard comercial
DROP VIEW IF EXISTS alissonerp.vw_dash_vendas_todas;

CREATE OR REPLACE VIEW alissonerp.vw_dash_vendas_todas AS
-- ── Legado: public.vendas (Evolury) ────────────────────────────────
SELECT
  'evolury'::text                                      AS origem,
  v.id                                                 AS id,
  v.numero_pedido::text                                AS numero,
  v.data                                               AS data_venda,
  v.entregue                                           AS entregue,
  v.data_entrega                                       AS data_entrega,
  c.nome                                               AS cliente_nome,
  vd.nome                                              AS vendedor_nome,
  v.total                                              AS total,
  v.total - COALESCE(SUM(p.valor) FILTER (WHERE p.situacao = 'pago'), 0)
                                                       AS saldo_pendente,
  false                                                AS aprovado,
  false                                                AS em_rota,
  v.status                                             AS status_tiny,
  v.situacao                                           AS situacao_pagamento,
  v.vendedor_id                                        AS vendedor_id

FROM public.vendas v
LEFT JOIN public.contatos   c  ON c.id_contato   = v.cliente_id
LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
LEFT JOIN public.parcelas   p  ON p.venda_id     = v.id

WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve
  WHERE ve.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')
    AND ve.tiny_pedido_id IS NOT NULL
    AND ve.tiny_pedido_id = v.id_api_tiny
    AND ve.data_venda >= '2026-04-23'
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve2
  WHERE ve2.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')
    AND ve2.tiny_pedido_id IS NULL
    AND ve2.numero_venda = v.numero_pedido::text
    AND ve2.data_venda < '2026-04-23'
    AND v.status != 2
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve3
  WHERE ve3.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')
    AND ve3.tiny_pedido_id IS NOT NULL
    AND ve3.tiny_pedido_id = v.id_api_tiny
    AND ve3.data_venda < '2026-04-23'
    AND v.status IS DISTINCT FROM 2
)

GROUP BY v.id, c.nome, vd.nome

UNION ALL

-- ── ERP: alissonerp.vendas_erp ────────────────────────────────────
SELECT
  'erp'::text                                          AS origem,
  ve.id::bigint                                        AS id,
  ve.numero_venda                                      AS numero,
  ve.data_venda                                        AS data_venda,
  CASE WHEN ve.situacao IN ('entregue','concluido')
       THEN true ELSE false END                        AS entregue,
  ve.data_entrega                                      AS data_entrega,
  c.nome                                               AS cliente_nome,
  u.nome                                               AS vendedor_nome,
  ve.total_venda                                       AS total,
  ve.total_venda - COALESCE(SUM(pv.valor) FILTER (
    WHERE pv.status IN ('confirmado','aprovado')
  ), 0)                                                AS saldo_pendente,
  ve.situacao = ANY(ARRAY['aprovado','em_rota','enviado','entregue','concluido'])
                                                       AS aprovado,
  ve.situacao = 'em_rota'                              AS em_rota,
  0                                                    AS status_tiny,
  NULL                                                 AS situacao_pagamento,
  ve.vendedor_id                                       AS vendedor_id

FROM alissonerp.vendas_erp ve
LEFT JOIN public.contatos   c  ON c.id_contato  = ve.cliente_id
LEFT JOIN public.vendedores vd ON vd.id_vendedor = ve.vendedor_id
LEFT JOIN alissonerp.usuarios u  ON u.vendedor_id = ve.vendedor_id
LEFT JOIN alissonerp.pagamentos_venda pv ON pv.venda_id = ve.id

WHERE ve.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')

GROUP BY ve.id, c.nome, u.nome, vd.nome;

GRANT SELECT ON alissonerp.vw_dash_vendas_todas TO anon, authenticated, service_role;

COMMENT ON VIEW alissonerp.vw_dash_vendas_todas IS
'Dashboard Comercial: UNION vendas legado (public.vendas) + ERP (alissonerp.vendas_erp). Inclui status em_rota para entregas via motoboy.';
