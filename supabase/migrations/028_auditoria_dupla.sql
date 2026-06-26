-- =============================================
-- MIGRATION 028: AUDITORIA DUPLA (LOJA + FÁBRICA)
-- =============================================
-- Loja  = criada pelo trigger ponte ao copiar ordem do PDV (obrigatória)
-- Fábrica = criada ao concluir saída PCP (revisa PMC/quebra)
-- =============================================
SET search_path TO alissonerp;

-- ═══ 1. NOVOS CAMPOS NA TABELA auditorias ════════════════════════════════════
ALTER TABLE alissonerp.auditorias
  ADD COLUMN IF NOT EXISTS ficha_tecnica_obs TEXT,
  ADD COLUMN IF NOT EXISTS dados_ordem       JSONB;

-- ═══ 2. MIGRAR TIPO EXISTENTE → 'fabrica' ═══════════════════════════════════
-- Auditorias criadas por fn_processar_saida_ordem tinham tipo='alerta'/'producao'
-- (indicavam nível de alerta). Agora tipo indica ONDE foi auditada.
UPDATE alissonerp.auditorias
SET tipo_auditoria = 'fabrica'
WHERE tipo_auditoria IN ('alerta', 'producao', NULL);

-- ═══ 3. UNIQUE INDEX PARCIAL em (ordem_id, tipo_auditoria) ═══════════════════
-- Garante no máximo 1 auditoria ativa (não-reprovada) por ordem/tipo.
-- Auditorias reprovadas ficam como histórico — sem restrição.
-- Remove duplicatas ativas de E2E (mantém o mais recente por ordem/tipo)
DELETE FROM alissonerp.auditorias a
WHERE situacao != 'reprovado'
  AND a.id NOT IN (
    SELECT MAX(id)
    FROM alissonerp.auditorias
    WHERE situacao != 'reprovado'
    GROUP BY ordem_id, tipo_auditoria
  );

-- Recriar como índice parcial (WHERE situacao != 'reprovado')
DROP INDEX IF EXISTS alissonerp.idx_auditoria_ordem_tipo;
CREATE UNIQUE INDEX idx_auditoria_ordem_tipo
  ON alissonerp.auditorias(ordem_id, tipo_auditoria)
  WHERE situacao != 'reprovado';

-- ═══ 4. ATUALIZAR fn_ponte_directus_para_alissonerp ══════════════════════════
-- Agora cria auditoria LOJA automaticamente na inserção de nova ordem
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem_id INTEGER;
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
    COALESCE(NEW.peso_metal_negocido, 0),     -- directus: typo histórico (sem "ia")
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
    NEW.local_atual::integer,                 -- bigint → integer
    NEW.distribuicao_id,
    COALESCE(NEW.protocolo_loja::boolean, false),  -- VARCHAR → boolean
    NEW.id_ordem_relacionada::integer,        -- bigint → integer
    NEW.id_asana,
    NEW.data_conclusao,
    COALESCE(NEW.date_created, now()),
    now(),
    NEW.id
  )
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    -- Campos protegidos por fn_proteger_campos_pdv NÃO entram no UPDATE
    -- (numero_ordem, cliente_id, vendedor_id, pedido_id, tipo_ordem, data_entrega, peso_metal_negociado)
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    updated_at            = now()
  RETURNING id INTO v_ordem_id;

  -- Criar auditoria LOJA somente em INSERT (não em UPDATE de ordens existentes)
  -- e somente se ainda não existir auditoria loja ativa para esta ordem
  IF TG_OP = 'INSERT' AND v_ordem_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM alissonerp.auditorias
      WHERE ordem_id = v_ordem_id
        AND tipo_auditoria = 'loja'
        AND situacao != 'reprovado'
    ) THEN
      INSERT INTO alissonerp.auditorias (
        situacao, tipo_auditoria, rota_processo, ordem_id,
        peso_negociado,
        dados_ordem
      ) VALUES (
        'pendente',
        'loja',
        'entrada_ordem',
        v_ordem_id,
        COALESCE(NEW.peso_metal_negocido, 0),
        jsonb_build_object(
          'numero_ordem',       NEW.numero_ordem,
          'tipo_ordem',         NEW.tipo_ordem,
          'rota',               NEW.rota,
          'peso_negociado',     NEW.peso_metal_negocido,
          'peso_externo',       NEW.peso_metal_externo,
          'cliente_id',         NEW.cliente_id,
          'vendedor_id',        NEW.vendedor_id,
          'data_entrega',       NEW.data_entrega::text,
          'itens_fabricacao',   NEW.itens_para_fabricacao
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 5. ATUALIZAR fn_processar_saida_ordem → tipo='fabrica' ══════════════════
-- Mantém toda a lógica PMC + agora define tipo='fabrica' explicitamente
-- Usa IF NOT EXISTS para não duplicar auditoria fabrica
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp          RECORD;
  v_item         RECORD;
  v_pmc          REAL;
  v_quebra       REAL;
  v_pct          REAL;
  v_ordem        RECORD;
  v_ourives_nome TEXT;
BEGIN
  -- Guard: ignorar inserts sem peso (saidas vazias criadas pelo Flow 03)
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_pcp
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC LIMIT 1;

  IF v_pcp.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum PCP ativo encontrado para ordem %', NEW.ordem_id;
  END IF;

  SELECT pmc, quebra, percentual INTO v_pmc, v_quebra, v_pct
  FROM alissonerp.fn_calcular_pmc_pcp(
    NEW.peso,
    COALESCE(v_pcp.total_geral_outros_pesos, 0),
    COALESCE(v_pcp.metal_externo, 0),
    COALESCE(v_pcp.total_metal, 0),
    COALESCE(v_pcp.retorno_metal, 0)
  );

  -- Movimentações de estoque (itens da ordem)
  FOR v_item IN
    SELECT ioi.insumo_id, ioi.peso, ioi.deposito_id, ins.categoria_id
    FROM alissonerp.itens_ordem_insumos ioi
    JOIN alissonerp.insumos ins ON ins.id = ioi.insumo_id
    WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
  LOOP
    IF v_item.categoria_id = 1 THEN
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SM', NEW.ordem_id, 'Saida ordem → saida_id #' || NEW.id::text
      );
    ELSE
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SP', NEW.ordem_id, 'Saida ordem → saida_id #' || NEW.id::text
      );
    END IF;
  END LOOP;

  -- Concluir PCP
  UPDATE alissonerp.pcp SET
    peso_final            = NEW.peso,
    pmc                   = v_pmc,
    quebra                = v_quebra,
    porcentagem_de_quebra = v_pct,
    saida_ordem_id        = NEW.id,
    etapas                = 'concluido',
    data_conclusao        = now(),
    updated_at            = now()
  WHERE id = v_pcp.id;

  -- Concluir ordem
  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  -- Dados complementares
  SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT up.name INTO v_ourives_nome
  FROM public.user_profiles up
  WHERE up.id_user = v_pcp.operador;

  -- Criar auditoria FÁBRICA (somente se não existir uma ativa)
  IF NOT EXISTS (
    SELECT 1 FROM alissonerp.auditorias
    WHERE ordem_id = NEW.ordem_id
      AND tipo_auditoria = 'fabrica'
      AND situacao != 'reprovado'
  ) THEN
    INSERT INTO alissonerp.auditorias (
      situacao, tipo_auditoria, rota_processo, ordem_id,
      peso_negociado, peso_final, pmc,
      quebra, quebra_percentual,
      total_metal, retorno_metal, metal_externo,
      ourives_nome
    ) VALUES (
      'pendente',
      'fabrica',
      'saida_pcp',
      NEW.ordem_id,
      COALESCE(v_ordem.peso_metal_negociado, 0),
      COALESCE(NEW.peso, 0),
      COALESCE(v_pmc, 0),
      COALESCE(v_quebra, 0),
      COALESCE(v_pct, 0),
      COALESCE(v_pcp.total_metal, 0),
      COALESCE(v_pcp.retorno_metal, 0),
      COALESCE(v_pcp.metal_externo, 0),
      COALESCE(v_ourives_nome, 'Sem operador')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 6. ATUALIZAR fn_processar_auditoria → loja vs fábrica ══════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem          RECORD;
  v_nova_ordem_id  INTEGER;
  v_saida_id       INTEGER;
BEGIN
  -- Só agir em transições de situacao
  IF TG_OP = 'UPDATE' AND OLD.situacao = NEW.situacao THEN RETURN NEW; END IF;
  IF NEW.ordem_id IS NULL THEN RETURN NEW; END IF;

  -- ── APROVADO ────────────────────────────────────────────────────────────────
  IF NEW.situacao = 'aprovado' THEN
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

    -- Auditoria LOJA aprovada: libera ordem para produção
    IF NEW.tipo_auditoria = 'loja' THEN
      UPDATE alissonerp.ordens SET
        status     = 'aguardando',
        updated_at = now()
      WHERE id = NEW.ordem_id;
    END IF;
    -- Auditoria FÁBRICA aprovada: vw_ordens_prontas_volta filtra automaticamente

    RETURN NEW;
  END IF;

  -- ── REPROVADO ───────────────────────────────────────────────────────────────
  IF NEW.situacao = 'reprovado' THEN
    IF NEW.motivo_reprovacao IS NULL OR TRIM(NEW.motivo_reprovacao) = '' THEN
      RAISE EXCEPTION 'Motivo de reprovação é obrigatório';
    END IF;
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

    IF NEW.tipo_auditoria = 'loja' THEN
      -- LOJA reprovada: marca ordem como rascunho (volta pro PDV corrigir)
      UPDATE alissonerp.ordens SET
        situacao          = 'rascunho'::alissonerp.enum_situacao_ordem,
        status            = 'aguardando'::alissonerp.enum_status_ordem,
        origem_reprovacao = 'auditoria_loja',
        updated_at        = now()
      WHERE id = NEW.ordem_id;

    ELSIF NEW.tipo_auditoria = 'fabrica' THEN
      -- FÁBRICA reprovada: criar ordem retrabalho + PCP
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
        'reparo'::alissonerp.enum_tipo_ordem,
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

  -- ── PENDENCIADO ─────────────────────────────────────────────────────────────
  IF NEW.situacao = 'pendenciado' THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ 7. VIEWS ════════════════════════════════════════════════════════════════

-- vw_auditorias_completa (adiciona tipo_auditoria_label + dados_ordem)
DROP VIEW IF EXISTS alissonerp.vw_auditorias_completa CASCADE;
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
  END AS situacao_label,
  a.tipo_auditoria,
  CASE a.tipo_auditoria
    WHEN 'loja'    THEN 'Auditoria Loja'
    WHEN 'fabrica' THEN 'Auditoria Fábrica'
    ELSE COALESCE(a.tipo_auditoria, 'Outro')
  END AS tipo_auditoria_label,
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  o.tipo_ordem::text AS tipo_ordem,
  o.rota::text       AS rota_ordem,
  a.ourives_nome,

  -- Dados de produção (auditoria fábrica)
  COALESCE(a.peso_negociado, 0)    AS peso_negociado,
  COALESCE(a.peso_final, 0)        AS peso_final,
  COALESCE(a.pmc, 0)               AS pmc,
  COALESCE(a.quebra, 0)            AS quebra,
  COALESCE(a.quebra_percentual, 0) AS quebra_percentual,
  COALESCE(a.total_metal, 0)       AS total_metal,
  COALESCE(a.retorno_metal, 0)     AS retorno_metal,
  COALESCE(a.metal_externo, 0)     AS metal_externo,

  -- Dados da ordem (auditoria loja)
  a.ficha_tecnica_obs,
  a.dados_ordem,

  -- Diferença peso negociado → final (%)
  CASE WHEN COALESCE(a.peso_negociado, 0) > 0 AND COALESCE(a.peso_final, 0) > 0
    THEN ROUND(((a.peso_final - a.peso_negociado) / a.peso_negociado * 100)::numeric, 1)
    ELSE 0
  END AS diff_peso_pct,

  -- Análise
  a.responsavel_id,
  up.name                          AS responsavel_nome,
  a.parecer,
  a.motivo_reprovacao,
  a.tipo_retrabalho,
  a.ordem_retrabalho_id,
  oret.numero_ordem                AS ordem_retrabalho_numero,

  -- Ordem: cliente / vendedor
  c.nome                           AS cliente_nome,
  v.nome                           AS vendedor_nome,

  -- Timestamps e dias em análise
  a.created_at,
  a.data_conclusao,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(a.data_conclusao, now()) - a.created_at
  )) / 86400.0, 1) AS dias_analise

FROM alissonerp.auditorias a
LEFT JOIN alissonerp.ordens o           ON o.id = a.ordem_id
LEFT JOIN public.user_profiles up       ON up.id_user = a.responsavel_id
LEFT JOIN alissonerp.ordens oret        ON oret.id = a.ordem_retrabalho_id
LEFT JOIN public.contatos c             ON c.id_contato = o.cliente_id
LEFT JOIN public.vendedores v           ON v.id_vendedor = o.vendedor_id;

-- vw_dashboard_auditoria (agora agrupado por tipo_auditoria)
DROP VIEW IF EXISTS alissonerp.vw_dashboard_auditoria CASCADE;
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

-- vw_ordens_prontas_volta: exige auditoria FÁBRICA aprovada
DROP VIEW IF EXISTS alissonerp.vw_ordens_prontas_volta CASCADE;
CREATE VIEW alissonerp.vw_ordens_prontas_volta AS
SELECT DISTINCT
  o.id,
  o.numero_ordem,
  o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.pcp p ON p.ordem_id = o.id AND p.etapas = 'concluido'
JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'fabrica' AND a.situacao = 'aprovado'
WHERE o.status::text NOT IN ('cancelado', 'entregue')
ORDER BY o.id DESC;

-- vw_ordens_prontas_ida: rota='protocolo' + auditoria LOJA aprovada
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_ida AS
SELECT DISTINCT
  o.id,
  o.numero_ordem,
  o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja' AND a.situacao = 'aprovado'
WHERE o.rota::text = 'protocolo'
  AND o.status::text NOT IN ('cancelado', 'entregue', 'concluido')
ORDER BY o.id DESC;

-- vw_ordens_prontas_pcp: rota='pcp' + auditoria LOJA aprovada + sem PCP ainda
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_pcp AS
SELECT DISTINCT
  o.id,
  o.numero_ordem,
  o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja' AND a.situacao = 'aprovado'
WHERE o.rota::text = 'pcp'
  AND o.status::text NOT IN ('cancelado', 'entregue', 'concluido')
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.pcp p WHERE p.ordem_id = o.id
  )
ORDER BY o.id DESC;

-- vw_ordens_aguardando_auditoria_loja: ordens bloqueadas na fila de auditoria loja
CREATE OR REPLACE VIEW alissonerp.vw_ordens_aguardando_auditoria_loja AS
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

-- ═══ 8. COMENTÁRIOS ══════════════════════════════════════════════════════════
COMMENT ON FUNCTION alissonerp.fn_ponte_directus_para_alissonerp IS
  'TEMPORÁRIO: Copia ordens situacao=2 do directus→alissonerp + cria auditoria loja automática. UPSERT via directus_ordem_id. Remover quando migrar PDV.';
COMMENT ON FUNCTION alissonerp.fn_processar_saida_ordem IS
  'Conclui PCP + cria auditoria fábrica pendente com dados PMC/quebra.';
COMMENT ON FUNCTION alissonerp.fn_processar_auditoria IS
  'Loja aprovada→libera produção. Fábrica aprovada→libera protocolo volta. Loja reprovada→rascunho. Fábrica reprovada→retrabalho.';
COMMENT ON VIEW alissonerp.vw_ordens_prontas_ida IS
  'Ordens com auditoria loja aprovada, rota=protocolo, prontas para protocolo ida.';
COMMENT ON VIEW alissonerp.vw_ordens_prontas_pcp IS
  'Ordens com auditoria loja aprovada, rota=pcp, sem PCP ainda.';
COMMENT ON VIEW alissonerp.vw_ordens_aguardando_auditoria_loja IS
  'Ordens bloqueadas aguardando auditoria loja (pendente/em_analise/pendenciado).';
