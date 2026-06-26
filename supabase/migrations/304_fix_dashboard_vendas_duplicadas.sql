-- ============================================================
-- Migration 304 — Corrige vendas DUPLICADAS na Dashboard Comercial
--
-- REGRA DE NEGÓCIO:
--   O QUE: a view vw_dash_vendas_todas une vendas do ERP (vendas_erp) + legado
--     (public.vendas). Cada venda nova do ERP ganha uma CÓPIA em public.vendas
--     (trigger fn_sync_venda_to_public) com id_api_tiny NULL e número diferente.
--     A deduplicação antiga casava por id_api_tiny/numero — que NÃO batem nessas
--     cópias — então a mesma venda aparecia 2x e inflava o faturamento.
--   O FIX: deduplicar pelo VÍNCULO FIXO e confiável vendas_erp.public_venda_id
--     (o banco grava sozinho; não depende de Tiny nem de número de pedido).
--     Exclui a cópia legado SOMENTE quando a venda gêmea do ERP é RECENTE
--     (>= 2026-04-23) e está aprovada/em_rota/enviada/entregue/concluida — ou seja,
--     o caso de duplicata real. Vendas ANTIGAS (pré-ERP) NÃO têm gêmea recente,
--     então continuam aparecendo (preserva o "pra trás" / comparação ano a ano).
--   POR QUE pelo vínculo fixo: as correções anteriores (migrations 182, 246, 290…)
--     casavam por código do Tiny/número, que mudou durante a refatoração e por isso
--     a dashboard voltava a quebrar. O public_venda_id é estável → para de quebrar.
--   IMPACTO SE REMOVIDO: a dashboard volta a contar vendas em dobro (jun/2026: +45
--     vendas / +R$ 166.748 de faturamento fantasma).
--
-- VALIDADO em produção (somente leitura) antes de aplicar:
--   jun/2026: 145 -> 101 vendas · R$ 638.571,99 -> R$ 471.923,99 (tira a duplicação)
--   jun/2025 (ano passado): 254 -> 254 vendas (histórico PRESERVADO)
--   duplicatas residuais após o fix: 0
--
-- NOTA: esta migration também CAPTURA NO CÓDIGO a definição real da view, que
--   estava editada manualmente direto no banco (divergência banco x git). A base é
--   a migration 268 + 'em_rota' (que já estava no banco) + o fix do public_venda_id.
--
-- Reversível: restaurar a definição anterior (ver docs/dashboard-comercial-vendas-duplicadas.md
--   e o arquivo de rollback gerado na aplicação).
-- ============================================================

SET search_path TO alissonerp, directus, public;

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
-- Dedup antigo (mantido): casa por tiny/numero quando existir
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
-- NOVO (fix 304): dedup pelo VÍNCULO FIXO public_venda_id.
-- Esconde a cópia legado quando a gêmea do ERP é recente e aparece no presente.
-- Vendas antigas (gêmea pré-cutoff) NÃO são afetadas → histórico preservado.
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve4
  WHERE ve4.public_venda_id = v.id
    AND ve4.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')
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
      AND pv.forma = 'Vale-Troca'   -- ATENCAO: pagamentos_venda usa 'Vale-Troca' (T maiusculo).
                                    -- O legado (parcelas_pedidos) usa 'Vale-troca' (minusculo).
                                    -- Casing DIFERENTE por tabela — nao unificar.
      AND pv.status = 'confirmado'
  ), 0)::numeric                                      AS valor_vale_troca,
  ve.situacao = 'em_rota'                             AS em_rota

FROM alissonerp.vendas_erp ve
WHERE ve.situacao IN ('aprovado', 'em_rota', 'enviado', 'entregue', 'concluido')
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

COMMENT ON VIEW alissonerp.vw_dash_vendas_todas IS
  'Dashboard Comercial: UNION legado (public.vendas) + ERP (vendas_erp). '
  'Dedup por public_venda_id (fix 304): esconde a cópia legado quando a gêmea ERP '
  'é recente (>=2026-04-23) e aprovada. Histórico pré-ERP preservado. Ver migration 304.';

-- ============================================================
-- Fim migration 304
-- ============================================================
