-- ============================================================
-- Migration 268 — Ajuste Financeiro + Blindagem + Sync + View
--
-- Remove 'confirmado' de todos os pontos do sistema:
--   Financeiro: conta a receber criado em 'entregue'/'concluido'
--   Blindagem:  só 'concluido' permanece imutável
--   Dashboard:  view vw_dash_vendas_todas sem 'confirmado'
--   Dados:      migra vendas existentes confirmado → aprovado
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- 1. Blindagem venda: fn_proteger_venda_fechada
-- ──────────────────────────────────────────────────────────────
-- Remove 'confirmado' da lista de status protegidos.
-- Apenas 'concluido' permanece imutável.
-- Mantém bypass via app.sync_ativo (migration 118).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_venda_fechada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN RETURN NEW; END IF;

  -- Só 'concluido' é protegido (confirmado removido do fluxo)
  IF OLD.situacao NOT IN ('concluido') THEN RETURN NEW; END IF;

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
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. Blindagem itens: fn_proteger_itens_venda_fechada
-- ──────────────────────────────────────────────────────────────
-- Remove 'confirmado' — só 'concluido' bloqueia alterações em itens
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE v_situacao TEXT;
BEGIN
  IF current_setting('app.sync_ativo', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  -- Só 'concluido' bloqueia — 'confirmado' não existe mais no fluxo
  IF v_situacao IN ('concluido') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Data Migration: confirmado → aprovado
-- ──────────────────────────────────────────────────────────────
-- Migra todas as vendas existentes que ainda estão em 'confirmado'
-- para 'aprovado'. Isso é seguro porque:
--   - A blindagem foi atualizada acima (não bloqueia)
--   - A state machine (migration 267) permite confirmado → aprovado
--   - O trigger de estoque fn_estoque_comercial_aprovar_venda
--     tem guard OLD.situacao != 'rascunho' → não faz nada
--   - O trigger financeiro atual (antes da redefinição abaixo)
--     tem guard OLD.situacao IN ('confirmado','concluido') → não cria duplicatas
-- ──────────────────────────────────────────────────────────────
UPDATE alissonerp.vendas_erp
SET situacao = 'aprovado'
WHERE situacao = 'confirmado';

-- ──────────────────────────────────────────────────────────────
-- 4. fn_venda_gerar_conta_receber
-- ──────────────────────────────────────────────────────────────
-- Só cria conta a receber quando a venda chega em 'entregue'
-- ou 'concluido'. Antes criava em 'confirmado'.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para entregue ou concluido
  IF NEW.situacao NOT IN ('entregue', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Não reprocessar se já estava em um desses estados
  IF OLD.situacao IN ('entregue', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata — evitar criar duas contas para mesma venda
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Criar conta a receber
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 5. fn_venda_gerar_conta_receber_on_insert
-- ──────────────────────────────────────────────────────────────
-- Se a venda já nasce em 'entregue' ou 'concluido', cria conta
-- a receber automaticamente.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se já nasce entregue ou concluido
  IF NEW.situacao NOT IN ('entregue', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Criar conta a receber
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. vw_dash_vendas_todas — remover 'confirmado'
-- ──────────────────────────────────────────────────────────────
-- Remove 'confirmado' de todas as cláusulas WHERE da view,
-- tanto na parte legado quanto na parte ERP.
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
  ), 0)::numeric                                      AS valor_vale_troca

FROM public.vendas v
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve
  WHERE ve.situacao IN ('aprovado', 'enviado', 'entregue', 'concluido')
    AND ve.tiny_pedido_id IS NOT NULL
    AND ve.tiny_pedido_id = v.id_api_tiny
    AND ve.data_venda >= '2026-04-23'
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve2
  WHERE ve2.situacao IN ('aprovado', 'enviado', 'entregue', 'concluido')
    AND ve2.tiny_pedido_id IS NULL
    AND ve2.numero_venda = v.numero_pedido::text
    AND ve2.data_venda < '2026-04-23'
    AND v.status != 2
)
AND NOT EXISTS (
  SELECT 1 FROM alissonerp.vendas_erp ve3
  WHERE ve3.situacao IN ('aprovado', 'enviado', 'entregue', 'concluido')
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
WHERE ve.situacao IN ('aprovado', 'enviado', 'entregue', 'concluido')
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
  'ERP inclui situacao aprovado/enviado/entregue/concluido (ex-confirmado removido). '
  'ERP inclui >= 2026-04-23 e pré-cutoff sem duplicata aprovada no legado. '
  'valor_vale_troca pré-computado por fonte.';

-- ──────────────────────────────────────────────────────────────
-- Grants
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION alissonerp.fn_proteger_venda_fechada()             TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_proteger_itens_venda_fechada()       TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_gerar_conta_receber()          TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_gerar_conta_receber_on_insert() TO authenticated;

-- ============================================================
-- Fim migration 268
-- ============================================================
