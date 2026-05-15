
SET search_path TO alissonerp;

-- =============================================
-- MIGRATION 021: TRIGGERS PROTOCOLO (Flows 02, 03, 05, 06)
-- =============================================

-- ═══ PATCH fn_processar_saida_ordem — adicionar guard peso NULL ═══
-- (evita exception ao inserir saida_ordem vazia no Flow 03)
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp    RECORD;
  v_item   RECORD;
  v_pmc    REAL;
  v_quebra REAL;
  v_pct    REAL;
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
        'SM', NEW.ordem_id, 'Saida ordem — saida_id #' || NEW.id::text
      );
    ELSE
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SP', NEW.ordem_id, 'Saida ordem — saida_id #' || NEW.id::text
      );
    END IF;
  END LOOP;

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

  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, data_conclusao)
  VALUES ('concluido', 'saida_pcp', 'pcp', NEW.ordem_id, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ FLOW 03 + 05 — CONCLUIR PROTOCOLO (ida→PCPs / volta→aprovacoes) ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo()
RETURNS TRIGGER AS $$
DECLARE
  v_rec      RECORD;
  v_saida_id INTEGER;
BEGIN
  -- Guard: so ao transicionar para 'concluido'
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;

  IF NEW.direcao = 'ida' THEN
    -- Flow 03: para cada ordem → saida_ordem vazia + PCP + atualiza ordem
    FOR v_rec IN
      SELECT o.id            AS ordem_id,
             COALESCE(o.peso_metal_externo, 0) AS metal_ext
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      -- Saida vazia (trigger em saidas_ordem e no-op pois peso=NULL com o novo guard)
      INSERT INTO alissonerp.saidas_ordem (ordem_id)
      VALUES (v_rec.ordem_id) RETURNING id INTO v_saida_id;

      -- PCP com zeros explicitos para evitar NULL + aritmetica
      INSERT INTO alissonerp.pcp (
        ordem_id, etapas, saida_ordem_id, metal_externo,
        total_metal, retorno_metal, total_pedras_un, total_pedras_g,
        total_geral_outros_pesos, total_outros_pesos_g
      ) VALUES (
        v_rec.ordem_id, 'novas_ordens', v_saida_id, v_rec.metal_ext,
        0, 0, 0, 0, 0, 0
      );

      -- Ordem → em_andamento
      UPDATE alissonerp.ordens
      SET status = 'em_andamento', updated_at = now()
      WHERE id = v_rec.ordem_id;
    END LOOP;

  ELSIF NEW.direcao = 'volta' THEN
    -- Flow 05: para cada ordem → aprovacao_consultora pendente
    FOR v_rec IN
      SELECT o.id AS ordem_id, o.vendedor_id
      FROM alissonerp.protocolo_ordens po
      JOIN alissonerp.ordens o ON po.ordem_id = o.id
      WHERE po.protocolo_id = NEW.id
    LOOP
      INSERT INTO alissonerp.aprovacoes_consultora (etapas, ordem_id, consultora_id)
      VALUES ('pendente', v_rec.ordem_id, v_rec.vendedor_id);
    END LOOP;
  END IF;

  -- Marcar data de conclusao
  NEW.data_conclusao := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_concluir_protocolo ON alissonerp.protocolos;
CREATE TRIGGER trg_concluir_protocolo
  BEFORE UPDATE ON alissonerp.protocolos
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_protocolo();


-- ═══ FLOW 06 — APROVACAO CONSULTORA → PREPARACAO ENTREGA ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_aprovacao_para_entrega()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: so ao aprovar
  IF NEW.etapas != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'aprovado' THEN RETURN NEW; END IF;

  INSERT INTO alissonerp.preparacoes_entrega (etapas, ordem_id)
  VALUES ('pendente', NEW.ordem_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_aprovacao_entrega ON alissonerp.aprovacoes_consultora;
CREATE TRIGGER trg_aprovacao_entrega
  AFTER UPDATE ON alissonerp.aprovacoes_consultora
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_aprovacao_para_entrega();


-- ═══ FLOW 02 — AUDITORIA APROVADA → CRIAR PCP ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
  v_saida_id INTEGER;
BEGIN
  -- Guard: so ao aprovar (nao em criacao de auditorias normais)
  IF NEW.situacao != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'aprovado' THEN RETURN NEW; END IF;
  IF NEW.ordem_id IS NULL THEN RETURN NEW; END IF;

  -- Reutilizar saida_ordem existente ou criar nova
  SELECT id INTO v_saida_id
  FROM alissonerp.saidas_ordem
  WHERE ordem_id = NEW.ordem_id
  ORDER BY id DESC LIMIT 1;

  IF v_saida_id IS NULL THEN
    INSERT INTO alissonerp.saidas_ordem (ordem_id)
    VALUES (NEW.ordem_id) RETURNING id INTO v_saida_id;
  END IF;

  -- Criar PCP
  INSERT INTO alissonerp.pcp (
    ordem_id, etapas, saida_ordem_id,
    total_metal, retorno_metal, total_pedras_un, total_pedras_g,
    total_geral_outros_pesos, total_outros_pesos_g, metal_externo
  ) VALUES (
    NEW.ordem_id, 'novas_ordens', v_saida_id,
    0, 0, 0, 0, 0, 0, 0
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_processar_auditoria ON alissonerp.auditorias;
CREATE TRIGGER trg_processar_auditoria
  AFTER UPDATE ON alissonerp.auditorias
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_auditoria();


COMMENT ON FUNCTION alissonerp.fn_concluir_protocolo IS
  'Flows 03+05: ida→cria PCPs em batch (saida_ordem vazia + pcp com zeros). volta→cria aprovacoes_consultora.';
COMMENT ON FUNCTION alissonerp.fn_aprovacao_para_entrega IS
  'Flow 06: aprovacoes_consultora→aprovado dispara INSERT em preparacoes_entrega.';
COMMENT ON FUNCTION alissonerp.fn_processar_auditoria IS
  'Flow 02: auditorias→aprovado cria PCP (reutiliza saida_ordem existente se houver).';
