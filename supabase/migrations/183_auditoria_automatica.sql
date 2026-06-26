-- Migration 183: Auditoria automática para todas as ordens
-- Não há mais auditoria humana. Toda ordem criada via PDV (Directus)
-- recebe auditoria loja aprovada automaticamente no momento da criação.

CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem_id  INTEGER;
  v_audit_id  INTEGER;
BEGIN
  -- Guard: só processar ordens com situacao = '2' (Criado)
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

  -- UPSERT da ordem
  INSERT INTO alissonerp.ordens (
    numero_ordem, cliente_id, vendedor_id, pedido_id,
    tipo_ordem,
    data_entrega, peso_metal_negociado, peso_metal_externo,
    itens_para_fabricacao,
    situacao, status, rota,
    tipo_controle, setor_atual, local_atual,
    distribuicao_id, protocolo_loja,
    id_ordem_relacionada, id_asana,
    data_conclusao, created_at, updated_at,
    directus_ordem_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'producao' WHEN '2' THEN 'reparo'  WHEN '3' THEN 'ajuste'
      WHEN '4' THEN 'banho'    WHEN '5' THEN 'gravacao' WHEN '6' THEN 'reposicao'
      WHEN '7' THEN 'outro'    ELSE       'outro'
    END::alissonerp.enum_tipo_ordem,
    NEW.data_entrega,
    COALESCE(NEW.peso_metal_negocido, 0),
    COALESCE(NEW.peso_metal_externo, 0),
    NEW.itens_para_fabricacao,
    'criado'::alissonerp.enum_situacao_ordem,
    CASE NEW.status
      WHEN '1' THEN 'aguardando' WHEN '2' THEN 'em_andamento' WHEN '3' THEN 'concluido'
      ELSE 'aguardando'
    END::alissonerp.enum_status_ordem,
    CASE NEW.rota WHEN '1' THEN 'pcp' WHEN '2' THEN 'protocolo' ELSE NULL END::alissonerp.enum_rota_ordem,
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
    NEW.id
  )
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    updated_at            = now()
  RETURNING id INTO v_ordem_id;

  -- Auditoria loja automática: somente em INSERT e se não existe auditoria ativa
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
          'itens_fabricacao', NEW.itens_para_fabricacao
        )
      ) RETURNING id INTO v_audit_id;

      -- Aprovação automática — dispara fn_processar_auditoria (cria PCP/saida_ordem)
      UPDATE alissonerp.auditorias
      SET situacao       = 'aprovado',
          data_conclusao = now(),
          parecer        = 'Aprovação automática — PDV'
      WHERE id = v_audit_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
