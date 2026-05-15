-- =============================================
-- MIGRATION 040: SERVIÇO SEMPRE rota=protocolo
-- Regra: orders vindas do PDV com tipo_ordem='servico' devem ter rota='protocolo'.
-- Retrabalhos (id_ordem_relacionada IS NOT NULL) criados por fn_processar_auditoria
-- ficam com rota='pcp' intencionalmente — NÃO são afetados.
-- =============================================

-- ─── 1. Corrigir trigger ponte ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ordem_id       INTEGER;
  v_numero_pedido  TEXT;
BEGIN
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

  -- Buscar numero_pedido em public.vendas (v.id = pedido_id)
  IF NEW.pedido_id IS NOT NULL THEN
    SELECT v.numero_pedido::text INTO v_numero_pedido
    FROM public.vendas v
    WHERE v.id = NEW.pedido_id;
  END IF;

  INSERT INTO alissonerp.ordens (
    numero_ordem, cliente_id, vendedor_id, pedido_id, numero_pedido,
    tipo_ordem,
    data_entrega, peso_metal_negociado, peso_metal_externo,
    itens_para_fabricacao,
    situacao, status, rota,
    tipo_controle, setor_atual, local_atual,
    distribuicao_id, protocolo_loja,
    id_ordem_relacionada, id_asana,
    data_conclusao, created_at, updated_at,
    directus_ordem_id,
    ficha_tecnica_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    v_numero_pedido,
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'servico'::alissonerp.enum_tipo_ordem
      WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
      WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
      WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
      WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
      WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
      WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
      ELSE          'servico'::alissonerp.enum_tipo_ordem
    END,
    NEW.data_entrega,
    COALESCE(NEW.peso_metal_negocido, 0),
    COALESCE(NEW.peso_metal_externo, 0),
    NEW.itens_para_fabricacao,
    'criado'::alissonerp.enum_situacao_ordem,
    CASE NEW.status
      WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
      WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
      WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
      ELSE          'aguardando'::alissonerp.enum_status_ordem
    END,
    -- Regra: tipo_ordem='1' (servico do PDV) SEMPRE protocolo
    -- Retrabalhos entram diretamente em alissonerp.ordens (não passam por esta trigger)
    CASE
      WHEN NEW.tipo_ordem = '1' THEN 'protocolo'::alissonerp.enum_rota_ordem
      WHEN NEW.rota = '1'       THEN 'pcp'::alissonerp.enum_rota_ordem
      WHEN NEW.rota = '2'       THEN 'protocolo'::alissonerp.enum_rota_ordem
      ELSE NULL
    END,
    NEW.tipo_controle,
    NEW.setor_atual,
    NEW.local_atual::integer,
    NEW.distribuicao_id,
    COALESCE(NEW.protocolo_loja::boolean, false),
    NEW.id_ordem_relacionada::integer,
    NEW.id_asana,
    NEW.data_conclusao,
    COALESCE(NEW.date_created, now()),
    now(),
    NEW.id,
    NEW.ficha_tecnica_id
  )
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    numero_pedido         = COALESCE(EXCLUDED.numero_pedido, alissonerp.ordens.numero_pedido),
    updated_at            = now()
  RETURNING id INTO v_ordem_id;

  -- Criar auditoria LOJA somente em INSERT
  IF TG_OP = 'INSERT' AND v_ordem_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM alissonerp.auditorias
      WHERE ordem_id = v_ordem_id
        AND tipo_auditoria = 'loja'
        AND situacao != 'reprovado'
    ) THEN
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado, dados_ordem
      ) VALUES (
        'pendente', 'loja', 'entrada_ordem', v_ordem_id,
        COALESCE(NEW.peso_metal_negocido, 0),
        jsonb_build_object(
          'numero_ordem',     NEW.numero_ordem,
          'tipo_ordem',       NEW.tipo_ordem,
          'rota',             NEW.rota,
          'peso_negociado',   NEW.peso_metal_negocido,
          'peso_externo',     NEW.peso_metal_externo,
          'cliente_id',       NEW.cliente_id,
          'vendedor_id',      NEW.vendedor_id,
          'data_entrega',     NEW.data_entrega::text,
          'itens_fabricacao', NEW.itens_para_fabricacao,
          'ficha_tecnica_id', NEW.ficha_tecnica_id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ─── 2. Backfill ─────────────────────────────────────────────────────────────
-- Critérios para corrigir:
--   tipo_ordem = 'servico'       → vieram do PDV como tipo='1'
--   rota = 'pcp' OR rota IS NULL → atribuídas errado (pcp) ou sem rota (NULL)
--   id_ordem_relacionada IS NULL → NÃO são retrabalhos (retrabalhos ficam em pcp)
-- Excluídos (mantidos como estão):
--   status = 'concluido'         → trabalho concluído, não mexer em dados históricos
--   status = 'em_andamento' E rota IS NULL → já em produção sem rota definida, não mexer
--   PCP com etapas != 'novas_ordens' → produção já iniciada

DO $$
DECLARE
  r          RECORD;
  v_pcp_id   INTEGER;
  v_etapas   TEXT;
BEGIN
  FOR r IN
    SELECT o.id, o.status, o.rota
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem = 'servico'
      AND (o.rota = 'pcp' OR (o.rota IS NULL AND o.status = 'aguardando'))
      AND o.id_ordem_relacionada IS NULL   -- não é retrabalho
      AND o.status != 'concluido'          -- não concluído
  LOOP
    -- Verificar se existe PCP para esta ordem
    SELECT p.id, p.etapas::text INTO v_pcp_id, v_etapas
    FROM alissonerp.pcp p
    WHERE p.ordem_id = r.id
    LIMIT 1;

    IF v_pcp_id IS NOT NULL AND v_etapas != 'novas_ordens' THEN
      -- PCP além de novas_ordens = produção já iniciada → não mexer
      CONTINUE;
    END IF;

    IF v_pcp_id IS NOT NULL AND v_etapas = 'novas_ordens' THEN
      -- PCP apenas em novas_ordens → remover (foi criado erroneamente)
      DELETE FROM alissonerp.pcp WHERE id = v_pcp_id;
      -- Remover saida_ordem associada, se existir e sem outros vínculos
      DELETE FROM alissonerp.saidas_ordem so
      WHERE so.ordem_id = r.id
        AND NOT EXISTS (
          SELECT 1 FROM alissonerp.pcp p2 WHERE p2.saida_ordem_id = so.id
        );
    END IF;

    -- Corrigir rota e status da ordem
    UPDATE alissonerp.ordens
    SET
      rota       = 'protocolo'::alissonerp.enum_rota_ordem,
      status     = 'aguardando'::alissonerp.enum_status_ordem,
      updated_at = now()
    WHERE id = r.id;

  END LOOP;
END $$;
