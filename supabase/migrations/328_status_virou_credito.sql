-- ============================================================
-- Migration 328 — Status novo 'virou_credito' para a venda (2026-06-21)
--
-- REGRA DE NEGÓCIO (ver docs/plano-status-virou-credito.md + docs/regras-negocio/crediario.md §3):
--   O QUE: quando uma reserva do crediário (③) estoura os 7 dias corridos e
--     vira vale-crédito (VC-), a venda passa para o status NOVO e TERMINAL
--     'virou_credito' — em vez de 'cancelado'. Distinto de cancelado porque:
--       - a PEÇA fica segurada (a reserva NÃO é devolvida automaticamente;
--         só volta ao saldo quando a estoquista APROVAR — endpoint à parte);
--       - o pagamento que entrou fica 'confirmado' (NÃO estorna) → a COMISSÃO
--         da consultora sobre o valor pago é preservada.
--   POR QUE: cancelar a venda (a) devolveria a peça na hora (gatilho 141) e
--     (b) tiraria a comissão do que foi pago (cálculo exclui cancelado/estornado).
--   IMPACTO SE REMOVIDO: reservas estouradas não teriam estado terminal próprio
--     e cairíamos de volta nas 2 pegadinhas (peça some / consultora perde comissão).
--
--   Funções alteradas (CREATE OR REPLACE, sem DROP — Database Safety §2):
--     1. fn_registrar_transicao_venda  (versão anterior: 296)
--     2. fn_proteger_itens_venda_fechada (versão anterior: 296)
--   View recriada (base = migration 304, que tem o dedup por public_venda_id):
--     3. vw_dash_vendas_todas — inclui 'virou_credito' contando APENAS o valor
--        PAGO (vale-troca e a-receber não faturam; o total da venda inflaria).
--
--   situacao é VARCHAR (não ENUM) → não precisa ALTER TYPE.
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- 1. State Machine: permite aprovado → virou_credito; terminal.
--    (base = migration 296; só acrescenta 'virou_credito')
-- ──────────────────────────────────────────────────────────────
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
    v_ok := v_para = ANY(ARRAY['rascunho','aprovado','cancelado']);
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado']);
  ELSIF v_de = 'aprovado' THEN
    -- + virou_credito: reserva do crediário estourou e virou vale-crédito.
    v_ok := v_para = ANY(ARRAY['em_rota','entregue','cancelado','virou_credito']);
  ELSIF v_de = 'em_rota' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de = 'confirmado' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','em_rota','entregue','cancelado']);
  ELSIF v_de = 'enviado' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de IN ('entregue','concluido','cancelado','virou_credito') THEN
    -- Terminais ('virou_credito' = terminal: a venda virou crédito, fim do fluxo).
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

-- ──────────────────────────────────────────────────────────────
-- 2. Proteger itens: 'virou_credito' é venda fechada (itens imutáveis).
--    (base = migration 296; só acrescenta 'virou_credito')
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
RETURNS TRIGGER AS $$
DECLARE
  v_situacao TEXT;
BEGIN
  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  IF v_situacao IN ('confirmado', 'concluido', 'entregue', 'virou_credito') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados. Solicite revisão ao gerente.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- 3. Dashboard: vw_dash_vendas_todas inclui 'virou_credito'.
--    Base = migration 304 (dedup por public_venda_id — NÃO reverter o fix).
--    FATURAMENTO: para 'virou_credito' o valor da venda passa a ser SÓ o PAGO
--    (formas que faturam = exclui Vale-Troca e A Receber); senão o total da
--    venda (incl. a parte que virou crédito) inflaria a receita.
-- ──────────────────────────────────────────────────────────────
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
  ), 0)::numeric                                      AS valor_vale_troca,
  false                                               AS em_rota

FROM public.vendas v
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve
  WHERE ve.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido', 'virou_credito')
    AND ve.tiny_pedido_id IS NOT NULL
    AND ve.tiny_pedido_id = v.id_api_tiny
    AND ve.data_venda >= '2026-04-23'
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve2
  WHERE ve2.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido', 'virou_credito')
    AND ve2.tiny_pedido_id IS NULL
    AND ve2.numero_venda = v.numero_pedido::text
    AND ve2.data_venda < '2026-04-23'
    AND v.status != 2
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve3
  WHERE ve3.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido', 'virou_credito')
    AND ve3.tiny_pedido_id IS NOT NULL
    AND ve3.tiny_pedido_id = v.id_api_tiny
    AND ve3.data_venda < '2026-04-23'
    AND v.status IS DISTINCT FROM 2
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve4
  WHERE ve4.public_venda_id = v.id
    AND ve4.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido', 'virou_credito')
    AND ve4.data_venda >= '2026-04-23'
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
  -- 'virou_credito': fatura SÓ o pago (exclui Vale-Troca e A Receber).
  CASE WHEN ve.situacao = 'virou_credito'
    THEN COALESCE((
      SELECT SUM(pvc.valor)
      FROM alissonerp.pagamentos_venda pvc
      WHERE pvc.venda_id = ve.id
        AND pvc.status = 'confirmado'
        AND pvc.forma NOT IN ('Vale-Troca', 'A Receber')
    ), 0)
    ELSE ve.total_venda
  END                                                 AS total_venda,
  ve.total_frete                                      AS frete_pago_cliente,
  NULL::integer                                       AS forma_envio_id,
  NULL::bigint                                        AS numero_pedido,
  COALESCE(ve.tiny_pedido_id::text, ve.numero_venda) AS numero_pedido_tiny,
  ve.tiny_pedido_id::bigint                           AS id_api_tiny,
  false                                               AS entregue,
  ve.forma_envio                                      AS forma_envio_texto,
  -- 'virou_credito' já fatura só o pago (sem vale) → não subtrair vale de novo.
  CASE WHEN ve.situacao = 'virou_credito' THEN 0::numeric
    ELSE COALESCE((
      SELECT SUM(pv.valor)
      FROM alissonerp.pagamentos_venda pv
      WHERE pv.venda_id = ve.id
        AND pv.forma = 'Vale-Troca'
        AND pv.status = 'confirmado'
    ), 0)::numeric
  END                                                 AS valor_vale_troca,
  ve.situacao = 'em_rota'                             AS em_rota

FROM alissonerp.vendas_erp ve
WHERE ve.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido', 'virou_credito')
  AND (
    ve.data_venda >= '2026-04-23'
    OR (
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

GRANT EXECUTE ON FUNCTION alissonerp.fn_registrar_transicao_venda()    TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_proteger_itens_venda_fechada() TO authenticated;

-- ============================================================
-- Fim migration 328
-- ============================================================
