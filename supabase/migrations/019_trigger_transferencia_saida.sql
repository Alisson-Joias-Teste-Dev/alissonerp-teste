
SET search_path TO alissonerp;

-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION 019: TRIGGER TRANSFERÊNCIA ENTRE SETORES + SAÍDA DA ORDEM
-- Flow 1002 — fn_processar_transferencia
-- Flow 1003 — fn_processar_saida_ordem
-- ═══════════════════════════════════════════════════════════════════════


-- ═══ FLOW 1002 — TRANSFERÊNCIA ENTRE SETORES ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_transferencia()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem   RECORD;
  v_item    RECORD;
BEGIN
  -- Guard: só processar quando destino estiver preenchido
  IF NEW.setor_id IS NULL OR NEW.deposito_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Para UPDATE: só processar se antes estava sem destino (evita reprocessamento)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.setor_id IS NOT NULL AND OLD.deposito_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Buscar localização atual da ordem (origem)
  SELECT local_atual, setor_atual INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  -- CE TED para cada insumo com saldo positivo
  IF v_ordem.local_atual IS NOT NULL THEN
    FOR v_item IN
      SELECT ioi.insumo_id, ioi.peso
      FROM alissonerp.itens_ordem_insumos ioi
      WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
    LOOP
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_ordem.local_atual, v_ordem.setor_atual,
        NEW.deposito_id, NEW.setor_id,
        'TED', NEW.ordem_id,
        'Transferência PCP #' || NEW.pcp_id::text
      );
    END LOOP;
  END IF;

  -- Atualizar localização da ordem
  UPDATE alissonerp.ordens
  SET setor_atual = NEW.setor_id,
      local_atual = NEW.deposito_id,
      updated_at  = now()
  WHERE id = NEW.ordem_id;

  -- PCP → em_andamento
  UPDATE alissonerp.pcp
  SET etapas     = 'em_andamento',
      updated_at = now()
  WHERE id = NEW.pcp_id;

  -- Criar próxima transferência vazia (aguardando próximo destino)
  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (NEW.pcp_id, NEW.ordem_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_transferencia_ordem ON alissonerp.transferencias_ordem;
CREATE TRIGGER trg_after_transferencia_ordem
  AFTER INSERT OR UPDATE ON alissonerp.transferencias_ordem
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_transferencia();


-- ═══ FLOW 1003 — SAÍDA DA ORDEM (PMC / QUEBRA) ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp    RECORD;
  v_item   RECORD;
  v_pmc    REAL;
  v_quebra REAL;
  v_pct    REAL;
BEGIN
  -- Buscar PCP ativo para esta ordem
  SELECT * INTO v_pcp
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC
  LIMIT 1;

  IF v_pcp.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum PCP ativo encontrado para ordem %', NEW.ordem_id;
  END IF;

  -- Calcular PMC / quebra
  SELECT pmc, quebra, percentual INTO v_pmc, v_quebra, v_pct
  FROM alissonerp.fn_calcular_pmc_pcp(
    NEW.peso,
    COALESCE(v_pcp.total_geral_outros_pesos, 0),
    COALESCE(v_pcp.metal_externo, 0),
    COALESCE(v_pcp.total_metal, 0),
    COALESCE(v_pcp.retorno_metal, 0)
  );

  -- CE SM (metal) e CE SP (pedra) por insumo
  FOR v_item IN
    SELECT ioi.insumo_id, ioi.peso, ioi.deposito_id, ins.categoria_id
    FROM alissonerp.itens_ordem_insumos ioi
    JOIN alissonerp.insumos ins ON ins.id = ioi.insumo_id
    WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
  LOOP
    IF v_item.categoria_id = 1 THEN
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL,
        NULL, NULL,
        'SM', NEW.ordem_id,
        'Saída ordem — saida_id #' || NEW.id::text
      );
    ELSE
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL,
        NULL, NULL,
        'SP', NEW.ordem_id,
        'Saída ordem — saida_id #' || NEW.id::text
      );
    END IF;
  END LOOP;

  -- Atualizar PCP com PMC/quebra e concluir
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

  -- Atualizar status da ordem
  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  -- Registrar auditoria
  INSERT INTO alissonerp.auditorias (situacao, tipo_auditoria, rota_processo, ordem_id, data_conclusao)
  VALUES ('concluido', 'saida_pcp', 'pcp', NEW.ordem_id, now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_saida_ordem ON alissonerp.saidas_ordem;
CREATE TRIGGER trg_after_saida_ordem
  AFTER INSERT ON alissonerp.saidas_ordem
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_saida_ordem();


COMMENT ON FUNCTION alissonerp.fn_processar_transferencia IS
  'Flow 1002: CE TED por insumo entre setores + atualiza local_atual/setor_atual da ordem + PCP→em_andamento + cria próxima transferência vazia.';
COMMENT ON FUNCTION alissonerp.fn_processar_saida_ordem IS
  'Flow 1003: Calcula PMC/quebra via fn_calcular_pmc_pcp + CE SM/SP por insumo + PCP→concluido + ordem→concluido + auditoria.';
