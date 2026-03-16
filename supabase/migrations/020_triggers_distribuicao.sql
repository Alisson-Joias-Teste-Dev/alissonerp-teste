
SET search_path TO alissonerp;

-- =============================================
-- MIGRATION 020: TRIGGERS DISTRIBUIÇÃO (Flows 1007-1014)
-- =============================================


-- ═══ FLOW 1011 — CRIAR/ATUALIZAR ITEM DISTRIBUIÇÃO ═══
-- (definida antes pois Flow 1007 a chama)
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_item_distribuicao(
  p_dist_id    INTEGER,
  p_insumo_id  INTEGER,
  p_deposito_id INTEGER,
  p_qtd        REAL,
  p_tipo       INTEGER
) RETURNS void AS $$
DECLARE
  v_existente INTEGER;
  v_mult REAL := CASE WHEN p_tipo IN (5, 6) THEN -1.0 ELSE 1.0 END;
BEGIN
  SELECT id INTO v_existente
  FROM alissonerp.itens_distribuicao
  WHERE distribuicao_id = p_dist_id AND insumo_id = p_insumo_id;

  IF v_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_distribuicao
    SET peso = peso + (p_qtd * v_mult)
    WHERE id = v_existente;
  ELSE
    INSERT INTO alissonerp.itens_distribuicao (distribuicao_id, deposito_id, insumo_id, peso)
    VALUES (p_dist_id, p_deposito_id, p_insumo_id, p_qtd * v_mult);
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ═══ FLOW 1012 — CRIAR FECHAMENTO AO VINCULAR ORDEM À DISTRIBUIÇÃO ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_fechamento_por_ordem()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.fechamentos_distribuicao (distribuicao_id, ordem_id)
  VALUES (NEW.distribuicao_id, NEW.ordens_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_distribuicao_ordem ON alissonerp.distribuicao_ordens;
CREATE TRIGGER trg_after_insert_distribuicao_ordem
  AFTER INSERT ON alissonerp.distribuicao_ordens
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_criar_fechamento_por_ordem();


-- ═══ FLOW 1007 — APONTAMENTO DISTRIBUIÇÃO ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_dist()
RETURNS TRIGGER AS $$
DECLARE
  v_marcador    alissonerp.enum_marcador_estoque;
  v_dep_almox   INTEGER := 1;
  v_peso_pedra  REAL;
BEGIN
  -- Buscar peso_pedra do insumo (usado nos tipos 3 e 6)
  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra := 0;
  END IF;

  CASE NEW.tipo_apontamento_id

    -- TIPO 1: Aditivo metal (ADD) → Dep1 → DepDist
    WHEN 1 THEN
      v_marcador := 'ADD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 2: Entrada metal (EIMD) → Dep1 → DepDist
    WHEN 2 THEN
      v_marcador := 'EIMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 3: Entrada pedra (EPD) → Dep1 → DepDist
    WHEN 3 THEN
      v_marcador := 'EPD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL
      );
      UPDATE alissonerp.distribuicoes SET
        total_pedras_un = total_pedras_un + NEW.qtd,
        total_pedras_g  = total_pedras_g  + (v_peso_pedra * NEW.qtd),
        updated_at      = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 5: Retorno metal (RMD) → DepDist → Dep1
    WHEN 5 THEN
      v_marcador := 'RMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, NULL, NULL
      );
      UPDATE alissonerp.distribuicoes
      SET retorno_metal = retorno_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 6: Retorno pedra (RPD) → DepDist → Dep1
    WHEN 6 THEN
      v_marcador := 'RPD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, NULL, NULL
      );
      UPDATE alissonerp.distribuicoes SET
        total_pedras_un = total_pedras_un - NEW.qtd,
        total_pedras_g  = total_pedras_g  - (v_peso_pedra * NEW.qtd),
        updated_at      = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 8: Entrada outros insumos (EOID) — saída do almox
    WHEN 8 THEN
      v_marcador := 'EOID';
      INSERT INTO alissonerp.movimentacoes_estoque
        (saida, entrada, insumo_id, deposito_id, marcador)
      VALUES (NEW.qtd, 0, NEW.insumo_id, v_dep_almox, v_marcador);

    -- TIPO 9: Ocorrência distribuição (ENTRADA) — sem CE significativo
    WHEN 9 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado na distribuicao', NEW.tipo_apontamento_id;

  END CASE;

  -- Flow 1011: upsert item da distribuição (tipos 1-6)
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_item_distribuicao(
      NEW.distribuicao_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_apontamento_dist ON alissonerp.apontamentos_distribuicao;
CREATE TRIGGER trg_after_insert_apontamento_dist
  AFTER INSERT ON alissonerp.apontamentos_distribuicao
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_apontamento_dist();


-- ═══ FLOW 1010 — OUTROS INSUMOS DISTRIBUIÇÃO ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_dist()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador)
  VALUES (NEW.peso, 0, NEW.insumo_id, 1, 'SOID');

  UPDATE alissonerp.distribuicoes SET
    total_outros_pesos       = total_outros_pesos       + NEW.peso,
    total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso,
    updated_at               = now()
  WHERE id = NEW.distribuicao_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_outros_insumos_dist ON alissonerp.outros_insumos_distribuicao;
CREATE TRIGGER trg_after_insert_outros_insumos_dist
  AFTER INSERT ON alissonerp.outros_insumos_distribuicao
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_outros_insumos_dist();


-- ═══ FLOW 1013 — FECHAMENTO DISTRIBUIÇÃO → ACUMULA NO PCP ═══
-- CRÍTICO: SOMA nos totais do PCP (não substitui!)
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_fechamento_dist()
RETURNS TRIGGER AS $$
DECLARE
  v_pcp_id    INTEGER;
  v_dep_dist  INTEGER;
BEGIN
  -- Guard: só processar quando peso é preenchido pela primeira vez
  IF NEW.peso IS NULL OR NEW.peso <= 0 THEN
    RETURN NEW;
  END IF;
  -- Para UPDATE: não reprocessar se já tinha peso > 0 (evita duplo acúmulo)
  IF TG_OP = 'UPDATE' AND OLD.peso IS NOT NULL AND OLD.peso > 0 THEN
    RETURN NEW;
  END IF;

  -- Buscar PCP ativo da ordem
  SELECT id INTO v_pcp_id
  FROM alissonerp.pcp
  WHERE ordem_id = NEW.ordem_id
    AND etapas NOT IN ('concluido', 'cancelado')
  ORDER BY id DESC
  LIMIT 1;

  IF v_pcp_id IS NULL THEN
    RAISE NOTICE 'Sem PCP ativo para ordem %, ignorando acumulo', NEW.ordem_id;
    RETURN NEW;
  END IF;

  -- Buscar depósito da distribuição (do primeiro apontamento)
  SELECT deposito_id INTO v_dep_dist
  FROM alissonerp.apontamentos_distribuicao
  WHERE distribuicao_id = NEW.distribuicao_id
  LIMIT 1;

  -- ═══ ACUMULAR NO PCP — SOMA, NÃO SUBSTITUI ═══
  UPDATE alissonerp.pcp SET
    total_metal     = total_metal     + COALESCE(NEW.pmc, 0),
    total_pedras_un = total_pedras_un + COALESCE(NEW.total_pedras_un, 0),
    total_pedras_g  = total_pedras_g  + COALESCE(NEW.total_pedras_g, 0),
    updated_at      = now()
  WHERE id = v_pcp_id;

  -- CE marcador TEDD (dep distribuição → dep1) usando insumo Ouro (id=1) como proxy
  IF v_dep_dist IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_par_movimentacao(
      1, NEW.peso,
      v_dep_dist, NULL,
      1, NULL,
      'TEDD', NEW.ordem_id,
      'Fechamento distribuicao #' || NEW.distribuicao_id::text || ' → PCP'
    );
  END IF;

  -- Mover ordem para almoxarifado (local_atual = 1)
  UPDATE alissonerp.ordens
  SET local_atual = 1, updated_at = now()
  WHERE id = NEW.ordem_id;

  -- Criar transferência vazia para a ordem (registra movimentação no histórico)
  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (v_pcp_id, NEW.ordem_id);

  -- Copiar itens distribuição → itens_ordem_insumos
  INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
  SELECT NEW.ordem_id, id_item.deposito_id, id_item.insumo_id, id_item.peso
  FROM alissonerp.itens_distribuicao id_item
  WHERE id_item.distribuicao_id = NEW.distribuicao_id
    AND id_item.peso > 0;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fechamento_distribuicao ON alissonerp.fechamentos_distribuicao;
CREATE TRIGGER trg_fechamento_distribuicao
  AFTER INSERT OR UPDATE ON alissonerp.fechamentos_distribuicao
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_fechamento_dist();


-- ═══ FLOW 1014 — DISTRIBUIÇÃO CONCLUÍDA ═══
-- BEFORE trigger para poder modificar NEW antes de gravar
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_distribuicao()
RETURNS TRIGGER AS $$
DECLARE
  v_pmc    REAL;
  v_quebra REAL;
  v_pct    REAL;
BEGIN
  -- Guard: só processar ao mudar para 'concluido'
  IF NEW.etapas != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'concluido' THEN RETURN NEW; END IF;

  -- PMC Dist = peso_final - total_geral_outros_pesos (SEM metal_externo)
  v_pmc    := COALESCE(NEW.peso_final, 0) - COALESCE(NEW.total_geral_outros_pesos, 0);
  -- Quebra Dist = (entrada - retorno) - PMC
  v_quebra := (COALESCE(NEW.total_metal, 0) - COALESCE(NEW.retorno_metal, 0)) - v_pmc;
  -- % Dist = quebra / PMC * 100
  v_pct    := CASE WHEN v_pmc > 0 THEN ROUND((v_quebra / v_pmc * 100)::numeric, 2)::REAL ELSE 0 END;

  -- CE TEDMD e TEDPD removidos — conclusão do lote é só administrativa.
  -- ZERO INSERT em movimentacoes_estoque (a saída por ordem via TEDD já cobre o estoque).

  -- Gravar PMC/quebra calculados na linha
  NEW.pmc                   := ROUND(v_pmc::numeric, 3);
  NEW.quebra                := ROUND(v_quebra::numeric, 3);
  NEW.porcentagem_de_quebra := v_pct;
  NEW.updated_at            := now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_concluir_distribuicao ON alissonerp.distribuicoes;
CREATE TRIGGER trg_concluir_distribuicao
  BEFORE UPDATE ON alissonerp.distribuicoes
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_distribuicao();


COMMENT ON FUNCTION alissonerp.fn_criar_fechamento_por_ordem IS 'Flow 1012: INSERT em fechamentos_distribuicao ao vincular ordem (trigger em distribuicao_ordens).';
COMMENT ON FUNCTION alissonerp.fn_processar_apontamento_dist IS 'Flow 1007: Branch tipo 1-9 com CE marcadores dist (ADD,EIMD,EPD,RMD,RPD,EOID) + Flow 1011.';
COMMENT ON FUNCTION alissonerp.fn_criar_item_distribuicao IS 'Flow 1011: Upsert em itens_distribuicao. Tipos 5,6 subtraem.';
COMMENT ON FUNCTION alissonerp.fn_processar_outros_insumos_dist IS 'Flow 1010: CE SOID + acumula total_outros_pesos/total_geral_outros_pesos.';
COMMENT ON FUNCTION alissonerp.fn_processar_fechamento_dist IS 'Flow 1013: ACUMULA no PCP (soma!), CE TEDD, move ordem → dep1, cria transferencia + copia itens.';
COMMENT ON FUNCTION alissonerp.fn_concluir_distribuicao IS 'Flow 1014: PMC=pf-outros (sem metal_ext), quebra=(entrada-retorno)-PMC, %=quebra/PMC. SÓ administrativo — sem CE (TEDMD/TEDPD removidos).';
