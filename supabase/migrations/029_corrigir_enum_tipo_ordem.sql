-- =============================================
-- MIGRATION 029: CORRIGIR enum_tipo_ordem
-- Mapeamento correto do PDV:
--   '1' = Serviço         (era: producao)
--   '2' = Fabricação      (era: reparo)
--   '3' = Reposição Venda (era: ajuste)
--   '4' = Reposição Loja  (era: banho)
--   '5' = Compra Fornec.  (era: gravacao)
--   '6' = Garantia        (era: reposicao)
--   '7' = Serviço Interno (era: outro)
-- =============================================
SET search_path TO alissonerp;

-- ═══ 1. DROPAR VIEWS QUE DEPENDEM DO ENUM ════════════════════════════════════
-- (CASCADE garante dependências transitivas)
DROP VIEW IF EXISTS alissonerp.vw_ordens_completa              CASCADE;
DROP VIEW IF EXISTS alissonerp.vw_ordens_por_tipo              CASCADE;
DROP VIEW IF EXISTS alissonerp.vw_ordem_detalhe                CASCADE;
DROP VIEW IF EXISTS alissonerp.vw_auditorias_completa          CASCADE;
DROP VIEW IF EXISTS alissonerp.vw_ordens_aguardando_auditoria_loja CASCADE;
DROP VIEW IF EXISTS alissonerp.vw_dashboard_auditoria          CASCADE;

-- ═══ 2. CRIAR NOVO ENUM ══════════════════════════════════════════════════════
CREATE TYPE alissonerp.enum_tipo_ordem_v2 AS ENUM (
  'servico',            -- '1' Serviço
  'fabricacao',         -- '2' Fabricação
  'reposicao_venda',    -- '3' Reposição Venda
  'reposicao_loja',     -- '4' Reposição Loja
  'compra_fornecedor',  -- '5' Compra de Fornecedor
  'garantia',           -- '6' Garantia
  'servico_interno'     -- '7' Serviço Interno
);

-- ═══ 3. MIGRAR COLUNA ordens.tipo_ordem ══════════════════════════════════════
ALTER TABLE alissonerp.ordens ALTER COLUMN tipo_ordem DROP DEFAULT;

ALTER TABLE alissonerp.ordens
  ALTER COLUMN tipo_ordem TYPE alissonerp.enum_tipo_ordem_v2
  USING CASE tipo_ordem::text
    WHEN 'producao'  THEN 'fabricacao'::alissonerp.enum_tipo_ordem_v2
    WHEN 'reparo'    THEN 'servico'::alissonerp.enum_tipo_ordem_v2
    WHEN 'ajuste'    THEN 'servico'::alissonerp.enum_tipo_ordem_v2
    WHEN 'banho'     THEN 'servico'::alissonerp.enum_tipo_ordem_v2
    WHEN 'gravacao'  THEN 'servico'::alissonerp.enum_tipo_ordem_v2
    WHEN 'reposicao' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem_v2
    WHEN 'outro'     THEN 'servico_interno'::alissonerp.enum_tipo_ordem_v2
    ELSE 'servico'::alissonerp.enum_tipo_ordem_v2
  END;

-- ═══ 4. TROCAR ENUM ══════════════════════════════════════════════════════════
DROP TYPE IF EXISTS alissonerp.enum_tipo_ordem;
ALTER TYPE alissonerp.enum_tipo_ordem_v2 RENAME TO enum_tipo_ordem;

-- ═══ 5. RECRIAR VIEWS ════════════════════════════════════════════════════════

-- 5.1 vw_ordens_completa
CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT
  o.id,
  o.numero_ordem,
  o.situacao::text                    AS situacao_cod,
  CASE o.situacao::text
    WHEN 'cancelado' THEN 'Cancelado'
    WHEN 'criado'    THEN 'Criado'
    WHEN 'rascunho'  THEN 'Rascunho'
    ELSE 'Desconhecido'
  END                                 AS situacao,
  o.status::text                      AS status_cod,
  CASE o.status::text
    WHEN 'aguardando'   THEN 'Aguardando'
    WHEN 'em_andamento' THEN 'Em Andamento'
    WHEN 'concluido'    THEN 'Concluído'
    ELSE 'Aguardando'
  END                                 AS status,
  o.rota::text                        AS rota_cod,
  CASE o.rota::text
    WHEN 'pcp'       THEN 'PCP'
    WHEN 'protocolo' THEN 'Protocolo'
    ELSE '—'
  END                                 AS rota,
  o.tipo_ordem::text                  AS tipo_ordem_cod,
  CASE o.tipo_ordem::text
    WHEN 'servico'           THEN 'Serviço'
    WHEN 'fabricacao'        THEN 'Fabricação'
    WHEN 'reposicao_venda'   THEN 'Reposição Venda'
    WHEN 'reposicao_loja'    THEN 'Reposição Loja'
    WHEN 'compra_fornecedor' THEN 'Compra de Fornecedor'
    WHEN 'garantia'          THEN 'Garantia'
    WHEN 'servico_interno'   THEN 'Serviço Interno'
    ELSE '—'
  END                                 AS tipo_ordem,
  o.setor_atual                       AS setor_id,
  s.nome                              AS setor_nome,
  o.local_atual                       AS deposito_id,
  d.nome                              AS deposito_nome,
  o.vendedor_id,
  v.nome                              AS vendedor_nome,
  o.cliente_id,
  c.nome                              AS cliente_nome,
  o.peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.created_at                        AS date_created,
  o.updated_at                        AS date_updated
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s      ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d    ON d.id = o.local_atual
LEFT JOIN public.vendedores v       ON v.id_vendedor = o.vendedor_id
LEFT JOIN public.contatos c         ON c.id_contato  = o.cliente_id;

-- 5.2 vw_ordens_por_tipo
CREATE VIEW alissonerp.vw_ordens_por_tipo AS
SELECT
  CASE o.tipo_ordem::text
    WHEN 'servico'           THEN 'Serviço'
    WHEN 'fabricacao'        THEN 'Fabricação'
    WHEN 'reposicao_venda'   THEN 'Reposição Venda'
    WHEN 'reposicao_loja'    THEN 'Reposição Loja'
    WHEN 'compra_fornecedor' THEN 'Compra de Fornecedor'
    WHEN 'garantia'          THEN 'Garantia'
    WHEN 'servico_interno'   THEN 'Serviço Interno'
    ELSE 'N/D'
  END         AS tipo,
  COUNT(*)    AS total
FROM alissonerp.ordens o
WHERE o.created_at > now() - INTERVAL '6 months'
GROUP BY o.tipo_ordem
ORDER BY COUNT(*) DESC;

-- 5.3 vw_ordem_detalhe (estrutura idêntica, labels atualizados)
CREATE VIEW alissonerp.vw_ordem_detalhe AS
SELECT
  o.id,
  o.numero_ordem,
  o.situacao::text                    AS situacao_cod,
  CASE o.situacao::text
    WHEN 'cancelado' THEN 'Cancelado'
    WHEN 'criado'    THEN 'Criado'
    WHEN 'rascunho'  THEN 'Rascunho'
    ELSE 'Desconhecido'
  END                                 AS situacao,
  o.status::text                      AS status_cod,
  CASE o.status::text
    WHEN 'aguardando'   THEN 'Aguardando'
    WHEN 'em_andamento' THEN 'Em Andamento'
    WHEN 'concluido'    THEN 'Concluído'
    ELSE 'Aguardando'
  END                                 AS status,
  o.rota::text                        AS rota_cod,
  CASE o.rota::text
    WHEN 'pcp'       THEN 'PCP'
    WHEN 'protocolo' THEN 'Protocolo'
    ELSE '—'
  END                                 AS rota,
  o.tipo_ordem::text                  AS tipo_ordem_cod,
  CASE o.tipo_ordem::text
    WHEN 'servico'           THEN 'Serviço'
    WHEN 'fabricacao'        THEN 'Fabricação'
    WHEN 'reposicao_venda'   THEN 'Reposição Venda'
    WHEN 'reposicao_loja'    THEN 'Reposição Loja'
    WHEN 'compra_fornecedor' THEN 'Compra de Fornecedor'
    WHEN 'garantia'          THEN 'Garantia'
    WHEN 'servico_interno'   THEN 'Serviço Interno'
    ELSE '—'
  END                                 AS tipo_ordem,
  o.setor_atual                       AS setor_id,
  s.nome                              AS setor_nome,
  o.local_atual                       AS deposito_id,
  d.nome                              AS deposito_nome,
  o.vendedor_id,
  v.nome                              AS vendedor_nome,
  o.cliente_id,
  c.nome                              AS cliente_nome,
  o.peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.created_at                        AS date_created,
  o.updated_at                        AS date_updated,
  -- PCP
  p.id                                AS pcp_id,
  p.etapas::text                      AS pcp_etapas_cod,
  CASE p.etapas::text
    WHEN 'novas_ordens' THEN 'Novas Ordens'
    WHEN 'pendencia'    THEN 'Pendência'
    WHEN 'aguardando'   THEN 'Aguardando'
    WHEN 'em_andamento' THEN 'Em Andamento'
    WHEN 'concluido'    THEN 'Concluído'
    WHEN 'cancelado'    THEN 'Cancelado'
    ELSE '—'
  END                                 AS pcp_etapas,
  p.total_metal                       AS pcp_total_metal,
  p.retorno_metal                     AS pcp_retorno_metal,
  p.total_pedras_un                   AS pcp_total_pedras_un,
  p.total_pedras_g                    AS pcp_total_pedras_g,
  p.total_geral_outros_pesos          AS pcp_total_outros,
  p.pmc                               AS pcp_pmc,
  p.quebra                            AS pcp_quebra,
  p.porcentagem_de_quebra             AS pcp_quebra_pct,
  p.peso_final                        AS pcp_peso_final,
  p.metal_externo                     AS pcp_metal_externo,
  p.bloqueado                         AS pcp_bloqueado,
  p.data_conclusao                    AS pcp_data_conclusao,
  p.local_atual                       AS pcp_local_atual,
  COALESCE(NULLIF(TRIM(up.name), ''), au.email::text, 'Sem operador') AS pcp_operador_nome,
  -- Distribuição
  dist.id                             AS dist_id,
  dist.setor::text                    AS dist_setor,
  dist.etapas::text                   AS dist_etapas_cod,
  CASE dist.etapas::text
    WHEN 'em_andamento' THEN 'Em Andamento'
    WHEN 'concluido'    THEN 'Concluído'
    ELSE NULL
  END                                 AS dist_etapas,
  dist.pmc                            AS dist_pmc,
  dist.quebra                         AS dist_quebra,
  dist.porcentagem_de_quebra          AS dist_quebra_pct
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s        ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d      ON d.id = o.local_atual
LEFT JOIN public.vendedores v         ON v.id_vendedor = o.vendedor_id
LEFT JOIN public.contatos c           ON c.id_contato  = o.cliente_id
LEFT JOIN alissonerp.pcp p            ON p.ordem_id    = o.id
LEFT JOIN auth.users au               ON au.id         = p.operador
LEFT JOIN public.user_profiles up     ON up.id_user    = au.id
LEFT JOIN alissonerp.distribuicoes dist ON dist.id     = o.distribuicao_id;

-- 5.4 vw_auditorias_completa (tipo_ordem apenas como text raw — sem label aqui)
CREATE VIEW alissonerp.vw_auditorias_completa AS
SELECT
  a.id,
  a.situacao,
  CASE a.situacao
    WHEN 'pendente'    THEN 'Pendente'
    WHEN 'em_analise'  THEN 'Em Análise'
    WHEN 'aprovado'    THEN 'Aprovada'
    WHEN 'reprovado'   THEN 'Reprovada'
    WHEN 'pendenciado' THEN 'Pendenciada'
    ELSE a.situacao
  END                                   AS situacao_label,
  a.tipo_auditoria,
  CASE a.tipo_auditoria
    WHEN 'loja'    THEN 'Auditoria Loja'
    WHEN 'fabrica' THEN 'Auditoria Fábrica'
    ELSE COALESCE(a.tipo_auditoria, 'Outro')
  END                                   AS tipo_auditoria_label,
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  o.tipo_ordem::text                    AS tipo_ordem,
  o.rota::text                          AS rota_ordem,
  a.ourives_nome,
  COALESCE(a.peso_negociado, 0)         AS peso_negociado,
  COALESCE(a.peso_final, 0)             AS peso_final,
  COALESCE(a.pmc, 0)                    AS pmc,
  COALESCE(a.quebra, 0)                 AS quebra,
  COALESCE(a.quebra_percentual, 0)      AS quebra_percentual,
  COALESCE(a.total_metal, 0)            AS total_metal,
  COALESCE(a.retorno_metal, 0)          AS retorno_metal,
  COALESCE(a.metal_externo, 0)          AS metal_externo,
  a.ficha_tecnica_obs,
  a.dados_ordem,
  CASE WHEN COALESCE(a.peso_negociado, 0) > 0 AND COALESCE(a.peso_final, 0) > 0
    THEN ROUND(((a.peso_final - a.peso_negociado) / a.peso_negociado * 100)::numeric, 1)
    ELSE 0
  END                                   AS diff_peso_pct,
  a.responsavel_id,
  up.name                               AS responsavel_nome,
  a.parecer,
  a.motivo_reprovacao,
  a.tipo_retrabalho,
  a.ordem_retrabalho_id,
  oret.numero_ordem                     AS ordem_retrabalho_numero,
  c.nome                                AS cliente_nome,
  v.nome                                AS vendedor_nome,
  a.created_at,
  a.data_conclusao,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(a.data_conclusao, now()) - a.created_at
  )) / 86400.0, 1)                      AS dias_analise
FROM alissonerp.auditorias a
LEFT JOIN alissonerp.ordens o         ON o.id = a.ordem_id
LEFT JOIN public.user_profiles up     ON up.id_user = a.responsavel_id
LEFT JOIN alissonerp.ordens oret      ON oret.id = a.ordem_retrabalho_id
LEFT JOIN public.contatos c           ON c.id_contato  = o.cliente_id
LEFT JOIN public.vendedores v         ON v.id_vendedor = o.vendedor_id;

-- 5.5 vw_dashboard_auditoria
CREATE VIEW alissonerp.vw_dashboard_auditoria AS
SELECT
  tipo_auditoria,
  COUNT(*) FILTER (WHERE situacao = 'pendente')    AS pendentes,
  COUNT(*) FILTER (WHERE situacao = 'em_analise')  AS em_analise,
  COUNT(*) FILTER (WHERE situacao = 'aprovado')    AS aprovadas,
  COUNT(*) FILTER (WHERE situacao = 'reprovado')   AS reprovadas,
  COUNT(*) FILTER (WHERE situacao = 'pendenciado') AS pendenciadas,
  COUNT(*)                                          AS total,
  CASE WHEN COUNT(*) FILTER (WHERE situacao IN ('aprovado','reprovado')) > 0
    THEN ROUND(
      COUNT(*) FILTER (WHERE situacao = 'aprovado')::numeric
      / COUNT(*) FILTER (WHERE situacao IN ('aprovado','reprovado')) * 100, 1)
    ELSE 0
  END AS taxa_aprovacao,
  COALESCE(ROUND(AVG(
    CASE WHEN data_conclusao IS NOT NULL
      THEN EXTRACT(EPOCH FROM (data_conclusao - created_at)) / 86400.0
    END
  )::numeric, 1), 0) AS media_dias,
  COUNT(*) FILTER (WHERE quebra_percentual > 5)    AS alertas_quebra
FROM alissonerp.auditorias
GROUP BY tipo_auditoria;

-- 5.6 vw_ordens_aguardando_auditoria_loja
CREATE VIEW alissonerp.vw_ordens_aguardando_auditoria_loja AS
SELECT
  o.id,
  o.numero_ordem,
  o.status::text      AS status,
  o.tipo_ordem::text  AS tipo_ordem,
  o.rota::text        AS rota,
  a.id                AS auditoria_id,
  a.situacao          AS auditoria_situacao,
  a.created_at        AS auditoria_criada_em
FROM alissonerp.ordens o
JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja'
WHERE a.situacao IN ('pendente', 'em_analise', 'pendenciado')
ORDER BY a.created_at DESC;

-- ═══ 6. ATUALIZAR fn_ponte_directus_para_alissonerp ══════════════════════════
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
    directus_ordem_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    -- Mapeamento CORRETO do PDV
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'servico'::alissonerp.enum_tipo_ordem
      WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
      WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
      WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
      WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
      WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
      WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
      ELSE      'servico'::alissonerp.enum_tipo_ordem
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

  -- Criar auditoria LOJA somente em INSERT (não em UPDATE)
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
        'pendente',
        'loja',
        'entrada_ordem',
        v_ordem_id,
        COALESCE(NEW.peso_metal_negocido, 0),
        jsonb_build_object(
          'numero_ordem',   NEW.numero_ordem,
          'tipo_ordem',     NEW.tipo_ordem,
          'rota',           NEW.rota,
          'peso_negociado', NEW.peso_metal_negocido,
          'peso_externo',   NEW.peso_metal_externo,
          'cliente_id',     NEW.cliente_id,
          'vendedor_id',    NEW.vendedor_id,
          'data_entrega',   NEW.data_entrega::text,
          'itens_fabricacao', NEW.itens_para_fabricacao
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 7. ATUALIZAR fn_processar_auditoria → usar 'servico' p/ retrabalho ═════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem          RECORD;
  v_nova_ordem_id  INTEGER;
  v_saida_id       INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.situacao = NEW.situacao THEN RETURN NEW; END IF;
  IF NEW.ordem_id IS NULL THEN RETURN NEW; END IF;

  -- ── APROVADO ────────────────────────────────────────────────────────────────
  IF NEW.situacao = 'aprovado' THEN
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());
    IF NEW.tipo_auditoria = 'loja' THEN
      UPDATE alissonerp.ordens SET
        status     = 'aguardando',
        updated_at = now()
      WHERE id = NEW.ordem_id;
    END IF;
    RETURN NEW;
  END IF;

  -- ── REPROVADO ───────────────────────────────────────────────────────────────
  IF NEW.situacao = 'reprovado' THEN
    IF NEW.motivo_reprovacao IS NULL OR TRIM(NEW.motivo_reprovacao) = '' THEN
      RAISE EXCEPTION 'Motivo de reprovação é obrigatório';
    END IF;
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

    IF NEW.tipo_auditoria = 'loja' THEN
      UPDATE alissonerp.ordens SET
        situacao          = 'rascunho'::alissonerp.enum_situacao_ordem,
        status            = 'aguardando'::alissonerp.enum_status_ordem,
        origem_reprovacao = 'auditoria_loja',
        updated_at        = now()
      WHERE id = NEW.ordem_id;

    ELSIF NEW.tipo_auditoria = 'fabrica' THEN
      SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

      INSERT INTO alissonerp.ordens (
        numero_ordem, cliente_id, vendedor_id,
        tipo_ordem, situacao, status, rota,
        peso_metal_negociado, id_ordem_relacionada,
        origem_reprovacao
      ) VALUES (
        COALESCE(v_ordem.numero_ordem, '#' || v_ordem.id::text) || '-RET',
        v_ordem.cliente_id,
        v_ordem.vendedor_id,
        'servico'::alissonerp.enum_tipo_ordem,   -- era 'reparo', agora 'servico'
        'criado'::alissonerp.enum_situacao_ordem,
        'aguardando'::alissonerp.enum_status_ordem,
        'pcp'::alissonerp.enum_rota_ordem,
        v_ordem.peso_metal_negociado,
        v_ordem.id,
        'auditoria_fabrica'
      ) RETURNING id INTO v_nova_ordem_id;

      INSERT INTO alissonerp.saidas_ordem (ordem_id)
      VALUES (v_nova_ordem_id)
      RETURNING id INTO v_saida_id;

      INSERT INTO alissonerp.pcp (
        ordem_id, etapas, saida_ordem_id,
        total_metal, retorno_metal, total_pedras_un, total_pedras_g,
        total_geral_outros_pesos, total_outros_pesos_g, metal_externo
      ) VALUES (
        v_nova_ordem_id, 'novas_ordens', v_saida_id,
        0, 0, 0, 0, 0, 0, 0
      );

      NEW.ordem_retrabalho_id := v_nova_ordem_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.situacao = 'pendenciado' THEN RETURN NEW; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 8. COMENTÁRIOS ══════════════════════════════════════════════════════════
COMMENT ON TYPE alissonerp.enum_tipo_ordem IS
  'Tipos de ordem conforme PDV: servico(1), fabricacao(2), reposicao_venda(3), reposicao_loja(4), compra_fornecedor(5), garantia(6), servico_interno(7)';
COMMENT ON FUNCTION alissonerp.fn_ponte_directus_para_alissonerp IS
  'TEMPORÁRIO: Copia ordens situacao=2 do directus→alissonerp + cria auditoria loja. Mapeamento tipo_ordem corrigido v029. Remover quando migrar PDV.';
COMMENT ON FUNCTION alissonerp.fn_processar_auditoria IS
  'Loja aprovada→libera produção. Fábrica aprovada→libera volta. Loja reprovada→rascunho. Fábrica reprovada→retrabalho (tipo=servico).';
