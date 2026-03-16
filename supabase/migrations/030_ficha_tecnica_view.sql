-- =============================================
-- MIGRATION 030: VIEW FICHA TÉCNICA
-- Expõe directus.ficha_tecnica_ordem para o schema alissonerp
-- JOIN via: alissonerp.ordens.directus_ordem_id → directus.ordens.ficha_tecnica_id
-- =============================================
SET search_path TO alissonerp;

-- ═══ 1. VIEW ficha técnica por ordem ═════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_fichas_tecnicas AS
SELECT
  o.id                        AS ordem_id,
  o.numero_ordem,
  ft.id                       AS ficha_id,
  ft.date_created,
  ft.date_updated,
  -- Medições principais
  ft.milimetragem_1,
  ft.milimetragem_2,
  ft.numeracao,
  ft.numeracao_2,
  ft.comprimento,
  -- Modelos e interno
  ft.modelo_1,
  ft.modelo_2,
  ft.modelo_interno_1,
  ft.modelo_interno_2,
  -- Fonte / gravação
  ft.tipo_fonte_1,
  ft.tipo_fonte_2,
  ft.texto_tipo_fonte_1,
  ft.texto_tipo_fonte_2,
  -- Anel
  ft.modelo_anel,
  ft.milimetragem_da_base,
  ft.milimetragem_do_aro,
  ft.modelo_interno_anel,
  ft.modelo_externo_anel,
  -- Pingente
  ft.modelo_pingente,
  ft."Outro_modelo_pingente"  AS outro_modelo_pingente,
  ft."Altura_pingente"        AS altura_pingente,
  ft.largura_pingente,
  -- Bracelete
  ft.modelo_bracelete,
  -- Elo / Fecho
  ft.tipo_elo,
  ft.outro_tipo_elo,
  ft.tipo_fecho,
  ft.outro_tipo_fecho,
  -- Placa / chapa
  ft.altura_placa,
  ft.largura_placa,
  ft.expessura_chapa,
  ft.nome_chapa,
  ft.tipo_tarraxa,
  -- Outros modelos
  ft.outro_modelo_1,
  ft.outro_modelo_2
FROM alissonerp.ordens o
JOIN directus.ordens  dor ON dor.id  = o.directus_ordem_id
JOIN directus.ficha_tecnica_ordem ft ON ft.id = dor.ficha_tecnica_id;

COMMENT ON VIEW alissonerp.vw_fichas_tecnicas IS
  'Ficha técnica por ordem (leitura directus). JOIN: alissonerp.ordens → directus.ordens → directus.ficha_tecnica_ordem';

-- ═══ 2. ATUALIZAR fn_ponte — incluir ficha_tecnica_id no INSERT ═══════════════
-- Garante que novas ordens vindas do PDV tenham ficha_tecnica_id preenchido
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem_id INTEGER;
BEGIN
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

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
    directus_ordem_id,
    ficha_tecnica_id       -- novo: vincula ficha na criação
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
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
    CASE NEW.rota
      WHEN '1' THEN 'pcp'::alissonerp.enum_rota_ordem
      WHEN '2' THEN 'protocolo'::alissonerp.enum_rota_ordem
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
    NEW.ficha_tecnica_id   -- novo
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION alissonerp.fn_ponte_directus_para_alissonerp IS
  'TEMPORÁRIO: Copia ordens situacao=2 do directus→alissonerp + auditoria loja. Inclui ficha_tecnica_id (v030). Remover quando migrar PDV.';
