-- =============================================
-- MIGRATION 026: MÓDULO AUDITORIA COMPLETO
-- =============================================
SET search_path TO alissonerp;

-- ═══════════════════════════════════════════════
-- 1. EXPANDIR TABELA AUDITORIAS
-- ═══════════════════════════════════════════════
ALTER TABLE alissonerp.auditorias
  ADD COLUMN IF NOT EXISTS responsavel_id    UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS parecer           TEXT,
  ADD COLUMN IF NOT EXISTS motivo_reprovacao TEXT,
  ADD COLUMN IF NOT EXISTS tipo_retrabalho   VARCHAR(50),
  ADD COLUMN IF NOT EXISTS peso_negociado    REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peso_final        REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pmc               REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quebra            REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quebra_percentual REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_metal       REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retorno_metal     REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metal_externo     REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ourives_nome      TEXT,
  ADD COLUMN IF NOT EXISTS ordem_retrabalho_id INTEGER REFERENCES alissonerp.ordens(id);

-- Normalizar situacao: 'concluido' e '1' → 'pendente'
-- (fn_processar_saida_ordem inseria 'concluido' incorretamente)
UPDATE alissonerp.auditorias
SET situacao = 'pendente'
WHERE situacao IN ('concluido', '1', 'pending');

-- ═══════════════════════════════════════════════
-- 2. SUBSTITUIR fn_processar_saida_ordem
--    Mantém toda lógica original + INSERT auditoria completa
-- ═══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp    RECORD;
  v_item   RECORD;
  v_pmc    REAL;
  v_quebra REAL;
  v_pct    REAL;
  v_ordem  RECORD;
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

  -- Buscar dados complementares para auditoria
  SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  -- Nome do ourives via user_profiles
  SELECT up.name INTO v_ourives_nome
  FROM public.user_profiles up
  WHERE up.id_user = v_pcp.operador;

  -- Criar auditoria COMPLETA (pendente, aguardando análise do gerente)
  INSERT INTO alissonerp.auditorias (
    situacao, tipo_auditoria, rota_processo, ordem_id,
    peso_negociado, peso_final, pmc,
    quebra, quebra_percentual,
    total_metal, retorno_metal, metal_externo,
    ourives_nome
  ) VALUES (
    'pendente',
    CASE WHEN v_pct > 5 THEN 'alerta' ELSE 'producao' END,
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════
-- 3. SUBSTITUIR fn_processar_auditoria
--    Aprovado → libera para protocolo volta (data_conclusao)
--    Reprovado → cria ordem retrabalho + PCP
-- ═══════════════════════════════════════════════
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

  -- ── APROVADO: liberar para protocolo volta ──────────────────────────
  IF NEW.situacao = 'aprovado' THEN
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());
    RETURN NEW;
  END IF;

  -- ── REPROVADO: criar ordem de retrabalho ───────────────────────────
  IF NEW.situacao = 'reprovado' THEN
    -- Motivo obrigatório
    IF NEW.motivo_reprovacao IS NULL OR TRIM(NEW.motivo_reprovacao) = '' THEN
      RAISE EXCEPTION 'Motivo de reprovação é obrigatório';
    END IF;

    SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

    -- Criar ordem de retrabalho
    -- Nota: ordens.motivo_reprovacao é INTEGER (legacy); o motivo textual
    -- fica armazenado na própria auditoria (auditorias.motivo_reprovacao TEXT)
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
      'auditoria'
    ) RETURNING id INTO v_nova_ordem_id;

    -- Criar saída vazia para o retrabalho (Flow 03 pattern)
    INSERT INTO alissonerp.saidas_ordem (ordem_id)
    VALUES (v_nova_ordem_id)
    RETURNING id INTO v_saida_id;

    -- Criar PCP para retrabalho
    INSERT INTO alissonerp.pcp (
      ordem_id, etapas, saida_ordem_id,
      total_metal, retorno_metal, total_pedras_un, total_pedras_g,
      total_geral_outros_pesos, total_outros_pesos_g, metal_externo
    ) VALUES (
      v_nova_ordem_id, 'novas_ordens', v_saida_id,
      0, 0, 0, 0, 0, 0, 0
    );

    -- Vincular ordem de retrabalho à auditoria
    NEW.ordem_retrabalho_id := v_nova_ordem_id;
    NEW.data_conclusao := COALESCE(NEW.data_conclusao, now());

    RETURN NEW;
  END IF;

  -- ── PENDENCIADO: apenas marcar (sem ação extra) ─────────────────────
  IF NEW.situacao = 'pendenciado' THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar o trigger (BEFORE UPDATE para poder modificar NEW)
DROP TRIGGER IF EXISTS trg_processar_auditoria ON alissonerp.auditorias;
CREATE TRIGGER trg_processar_auditoria
  BEFORE UPDATE ON alissonerp.auditorias
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_auditoria();

-- ═══════════════════════════════════════════════
-- 4. VIEW AUDITORIA COMPLETA
-- ═══════════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_auditorias_completa AS
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
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  a.ourives_nome,

  -- Dados de produção
  COALESCE(a.peso_negociado, 0)    AS peso_negociado,
  COALESCE(a.peso_final, 0)        AS peso_final,
  COALESCE(a.pmc, 0)               AS pmc,
  COALESCE(a.quebra, 0)            AS quebra,
  COALESCE(a.quebra_percentual, 0) AS quebra_percentual,
  COALESCE(a.total_metal, 0)       AS total_metal,
  COALESCE(a.retorno_metal, 0)     AS retorno_metal,
  COALESCE(a.metal_externo, 0)     AS metal_externo,

  -- Diferença peso negociado → final (%)
  CASE WHEN COALESCE(a.peso_negociado, 0) > 0
    THEN ROUND(((COALESCE(a.peso_final, 0) - a.peso_negociado) / a.peso_negociado * 100)::numeric, 1)
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

  -- Timestamps e tempo em análise
  a.created_at,
  a.data_conclusao,
  ROUND(EXTRACT(EPOCH FROM (
    COALESCE(a.data_conclusao, now()) - a.created_at
  )) / 86400.0, 1) AS dias_analise

FROM alissonerp.auditorias a
LEFT JOIN alissonerp.ordens o           ON o.id = a.ordem_id
LEFT JOIN auth.users au                  ON au.id = a.responsavel_id
LEFT JOIN public.user_profiles up        ON up.id_user = a.responsavel_id
LEFT JOIN alissonerp.ordens oret         ON oret.id = a.ordem_retrabalho_id
LEFT JOIN public.contatos c              ON c.id_contato = o.cliente_id
LEFT JOIN public.vendedores v            ON v.id_vendedor = o.vendedor_id;

-- ═══════════════════════════════════════════════
-- 5. VIEW DASHBOARD AUDITORIA
-- ═══════════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_dashboard_auditoria AS
SELECT
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
FROM alissonerp.auditorias;

-- ═══════════════════════════════════════════════
-- 6. ÍNDICES
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_auditorias_situacao  ON alissonerp.auditorias(situacao);
CREATE INDEX IF NOT EXISTS idx_auditorias_tipo       ON alissonerp.auditorias(tipo_auditoria);
CREATE INDEX IF NOT EXISTS idx_auditorias_ordem_id   ON alissonerp.auditorias(ordem_id);

-- ═══════════════════════════════════════════════
-- 7. RLS
-- ═══════════════════════════════════════════════
ALTER TABLE alissonerp.auditorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_full_auditorias" ON alissonerp.auditorias;
DROP POLICY IF EXISTS "read_auditorias"       ON alissonerp.auditorias;

CREATE POLICY "admin_full_auditorias" ON alissonerp.auditorias
  FOR ALL TO authenticated
  USING (alissonerp.fn_user_role() IN ('admin','gerente_fabrica','gerente_loja'))
  WITH CHECK (alissonerp.fn_user_role() IN ('admin','gerente_fabrica','gerente_loja'));

CREATE POLICY "read_auditorias" ON alissonerp.auditorias
  FOR SELECT TO authenticated
  USING (alissonerp.fn_user_role() IN ('pcp','ourives','consultora'));

COMMENT ON TABLE  alissonerp.auditorias                     IS 'Auditoria de qualidade pós-PCP. Criada automaticamente ao concluir saída.';
COMMENT ON FUNCTION alissonerp.fn_processar_saida_ordem     IS 'Conclui PCP + cria auditoria pendente com dados PMC/quebra.';
COMMENT ON FUNCTION alissonerp.fn_processar_auditoria       IS 'Aprovado→data_conclusao. Reprovado→ordem retrabalho+PCP.';
