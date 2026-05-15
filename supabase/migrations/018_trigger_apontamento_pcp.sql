
SET search_path TO alissonerp;

-- =============================================
-- MIGRATION 018: TRIGGER APONTAMENTO PCP
-- Implementa Flow 1000 + 1001 + 1004 + 1005
-- =============================================

-- ═══ FLOW 1001 — CRIAR/ATUALIZAR ITENS DA ORDEM ═══
-- (criada antes pois Flow 1000 a chama)
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_itens_ordem(
  p_ordem_id INTEGER,
  p_insumo_id INTEGER,
  p_deposito_id INTEGER,
  p_qtd REAL,
  p_tipo_apontamento INTEGER
) RETURNS void AS $$
DECLARE
  v_item_existente INTEGER;
  v_multiplicador REAL;
BEGIN
  -- Retornos (tipo 5,6) subtraem; entradas (tipo 1,2,3,4) somam
  v_multiplicador := CASE WHEN p_tipo_apontamento IN (5, 6) THEN -1.0 ELSE 1.0 END;

  SELECT id INTO v_item_existente
  FROM alissonerp.itens_ordem_insumos
  WHERE ordem_id = p_ordem_id AND insumo_id = p_insumo_id;

  IF v_item_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_ordem_insumos
    SET peso = peso + (p_qtd * v_multiplicador),
        updated_at = now()
    WHERE id = v_item_existente;
  ELSE
    INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
    VALUES (p_ordem_id, p_deposito_id, p_insumo_id, p_qtd * v_multiplicador);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ═══ FLOW 1000 — TRIGGER PRINCIPAL DE APONTAMENTO PCP ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_pcp()
RETURNS TRIGGER AS $$
DECLARE
  v_ordem_id INTEGER;
  v_marcador alissonerp.enum_marcador_estoque;
  v_peso_pedra_unitario REAL;
  v_dep_almox INTEGER := 1;
BEGIN
  -- Buscar ordem_id via PCP
  SELECT p.ordem_id INTO v_ordem_id
  FROM alissonerp.pcp p WHERE p.id = NEW.pcp_id;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'PCP % nao encontrado ou sem ordem vinculada', NEW.pcp_id;
  END IF;

  -- Buscar peso_pedra do insumo (usado no tipo 3 e 6)
  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra_unitario
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra_unitario := 0;
  END IF;

  -- ═══ BRANCH POR TIPO DE APONTAMENTO ═══
  CASE NEW.tipo_apontamento_id

    -- TIPO 1: Aditivo de Metal (AD) → Dep1→DepOrdem
    WHEN 1 THEN
      v_marcador := 'AD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 2: Entrada de Metal (EM) → Dep1→DepOrdem
    WHEN 2 THEN
      v_marcador := 'EM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 3: Entrada de Pedra (EP) → Dep1→DepOrdem
    WHEN 3 THEN
      v_marcador := 'EP';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id
      );
      UPDATE alissonerp.pcp SET
        total_pedras_un = total_pedras_un + NEW.qtd,
        total_pedras_g  = total_pedras_g  + (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
      WHERE id = NEW.pcp_id;
      -- Flow 1005: criar registro em pedras_ordens
      IF COALESCE(v_peso_pedra_unitario, 0) > 0 THEN
        INSERT INTO alissonerp.pedras_ordens (ordem_id, deposito_id, peso, peso_pedra, qtd_pedras)
        VALUES (v_ordem_id, NEW.deposito_id, v_peso_pedra_unitario * NEW.qtd, v_peso_pedra_unitario, NEW.qtd);
      END IF;

    -- TIPO 4: Baixa de Insumo (BI) → DepOrdem→Dep1
    WHEN 4 THEN
      v_marcador := 'BI';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id
      );

    -- TIPO 5: Retorno de Metal (RM) → DepOrdem→Dep1
    WHEN 5 THEN
      v_marcador := 'RM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id
      );
      UPDATE alissonerp.pcp SET retorno_metal = retorno_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 6: Retorno de Pedra (RP) → DepOrdem→Dep1
    WHEN 6 THEN
      v_marcador := 'RP';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id
      );
      UPDATE alissonerp.pcp SET
        total_pedras_un = total_pedras_un - NEW.qtd,
        total_pedras_g  = total_pedras_g  - (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
      WHERE id = NEW.pcp_id;

    -- TIPO 7: Ocorrencia — SEM CE
    WHEN 7 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado no PCP', NEW.tipo_apontamento_id;
  END CASE;

  -- Flow 1001: atualizar itens_ordem_insumos para tipos 1-6
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_itens_ordem(
      v_ordem_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_apontamento_pcp ON alissonerp.apontamentos_pcp;
CREATE TRIGGER trg_after_insert_apontamento_pcp
  AFTER INSERT ON alissonerp.apontamentos_pcp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_apontamento_pcp();

-- ═══ FLOW 1004 — OUTROS INSUMOS PCP ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_pcp()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador, ordem_id, obs)
  VALUES
    (NEW.peso, 0, NEW.insumo_id, 1, 'SOI', NEW.ordem_id, 'Outros insumos PCP');

  UPDATE alissonerp.pcp
  SET total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso
  WHERE id = NEW.pcp_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_insert_outros_insumos_pcp ON alissonerp.outros_insumos_pcp;
CREATE TRIGGER trg_after_insert_outros_insumos_pcp
  AFTER INSERT ON alissonerp.outros_insumos_pcp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_outros_insumos_pcp();

COMMENT ON FUNCTION alissonerp.fn_processar_apontamento_pcp IS 'Flow 1000: Branch por tipo 1-7, CE dupla-entrada, atualiza totais PCP, chama fn_criar_itens_ordem.';
COMMENT ON FUNCTION alissonerp.fn_criar_itens_ordem IS 'Flow 1001: Cria/atualiza itens_ordem_insumos. Se existe soma peso, senao insere.';
COMMENT ON FUNCTION alissonerp.fn_processar_outros_insumos_pcp IS 'Flow 1004: CE marcador SOI + atualiza total_geral_outros_pesos no PCP.';
