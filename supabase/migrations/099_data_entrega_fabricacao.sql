-- Migration 099: Data de entrega automática para ordens de fabricação
-- Regra: tipo_ordem = 'fabricacao' → data_entrega = CURRENT_DATE + 10 dias úteis (seg-sex)
-- Aplica em: trigger ponte PDV (fn_ponte_directus_para_alissonerp)
-- Criado: 30/03/2026

BEGIN;

-- ─── PARTE 1: Função utilitária de dias úteis ─────────────────────────────────

CREATE OR REPLACE FUNCTION alissonerp.fn_adicionar_dias_uteis(
  p_data_inicio DATE,
  p_dias_uteis  INTEGER
) RETURNS DATE AS $$
DECLARE
  v_data_atual      DATE;
  v_dias_adicionados INTEGER := 0;
BEGIN
  v_data_atual := p_data_inicio;

  WHILE v_dias_adicionados < p_dias_uteis LOOP
    v_data_atual := v_data_atual + 1;
    -- EXTRACT(DOW): 0=domingo, 6=sábado
    IF EXTRACT(DOW FROM v_data_atual) NOT IN (0, 6) THEN
      v_dias_adicionados := v_dias_adicionados + 1;
    END IF;
  END LOOP;

  RETURN v_data_atual;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION alissonerp.fn_adicionar_dias_uteis(DATE, INTEGER) IS
  'Retorna a data após N dias úteis (seg-sex). Não conta o dia de início.';

-- Testes de sanidade (executados durante a migration):
DO $$
BEGIN
  -- Segunda 31/03/2026 + 10 DU → esperado 2026-04-14
  ASSERT alissonerp.fn_adicionar_dias_uteis('2026-03-31', 10) = '2026-04-14',
    'FALHOU: 31/03 + 10 DU deveria ser 14/04';

  -- Sexta 03/04 + 1 DU → esperado 06/04 (segunda)
  ASSERT alissonerp.fn_adicionar_dias_uteis('2026-04-03', 1) = '2026-04-06',
    'FALHOU: 03/04 (sex) + 1 DU deveria ser 06/04 (seg)';

  -- Sábado 04/04 + 1 DU → esperado 06/04 (segunda, sáb e dom não contam)
  ASSERT alissonerp.fn_adicionar_dias_uteis('2026-04-04', 1) = '2026-04-06',
    'FALHOU: 04/04 (sáb) + 1 DU deveria ser 06/04 (seg)';
END $$;

-- ─── PARTE 2: Trigger ponte com cálculo de data_entrega para fabricação ───────
-- Mudança cirúrgica: só o campo data_entrega no INSERT VALUES
-- O ON CONFLICT DO UPDATE permanece sem data_entrega (correto — não recalcula em edição)

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
        detalhes_ordem,
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
          WHEN '1' THEN 'servico_venda'::alissonerp.enum_tipo_ordem
          WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
          WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
          WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
          WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
          WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
          WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
          ELSE          'servico_venda'::alissonerp.enum_tipo_ordem
        END,
        -- data_entrega: fabricação → sempre 10 dias úteis a partir de hoje
        -- outros tipos → respeita o que veio do Directus (pode ser null)
        CASE WHEN NEW.tipo_ordem = '2'
          THEN alissonerp.fn_adicionar_dias_uteis(CURRENT_DATE, 10)
          ELSE NEW.data_entrega
        END,
        COALESCE(NEW.peso_metal_negocido, 0),
        COALESCE(NEW.peso_metal_externo, 0),
        NEW.itens_para_fabricacao,
        NEW.detalhes_ordem,
        'criado'::alissonerp.enum_situacao_ordem,
        CASE NEW.status
          WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
          WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
          WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
          ELSE          'aguardando'::alissonerp.enum_status_ordem
        END,
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
        detalhes_ordem        = EXCLUDED.detalhes_ordem,
        status                = EXCLUDED.status,
        rota                  = EXCLUDED.rota,
        setor_atual           = EXCLUDED.setor_atual,
        local_atual           = EXCLUDED.local_atual,
        numero_pedido         = COALESCE(EXCLUDED.numero_pedido, alissonerp.ordens.numero_pedido),
        updated_at            = now()
      RETURNING id INTO v_ordem_id;

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

COMMIT;
