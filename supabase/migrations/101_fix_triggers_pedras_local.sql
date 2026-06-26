-- Migration 101: Fix emergencia -- mismatch unidade pedras + local_estoque_id ausente
-- Data: 30/03/2026 | Sprint: fix v2.14.1
--
-- Problemas corrigidos:
--   BUG 1: fn_criar_itens_ordem gravava NEW.qtd (UNIDADES) como peso para pedras.
--           fn_processar_saida_ordem assume ioi.peso em GRAMAS (divide por 0.2).
--           Fix: novo parametro p_peso_gramas (6, DEFAULT NULL);
--                metal: COALESCE(NULL, p_qtd) = p_qtd (sem mudanca);
--                pedras: caller passa qtd x peso_pedra_unitario (gramas).
--
--   BUG 2: fn_processar_transferencia nao passava local_estoque_id nos CEs.
--           Fix: passa 1 como 10 argumento de fn_criar_par_movimentacao.
--
--   BUG 3: fn_processar_lancamento_avulso nao passava local_estoque_id.
--           Fix: INSERTs diretos recebem local_estoque_id = 1;
--                chamada fn_criar_par_movimentacao recebe p_local_id = 1.
--
-- NAO TOCADOS (intocaveis):
--   fn_concluir_protocolo, fn_processar_auditoria
--
-- Backward compat total para metal:
--   fn_criar_itens_ordem(5 args sem p_peso_gramas) = comportamento anterior via COALESCE

BEGIN;

-- ======================================================
-- PARTE 1: fn_criar_itens_ordem
-- Adiciona parametro p_peso_gramas (6, DEFAULT NULL)
-- Metal:  COALESCE(NULL, p_qtd) = p_qtd
-- Pedras: caller passa peso_pedra x qtd (gramas)
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_criar_itens_ordem(
  p_ordem_id         INTEGER,
  p_insumo_id        INTEGER,
  p_deposito_id      INTEGER,
  p_qtd              REAL,
  p_tipo_apontamento INTEGER,
  p_peso_gramas      REAL DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_existente INTEGER;
  v_multiplicador  REAL;
  v_peso_real      REAL;
BEGIN
  -- Retornos (tipo 5,6) subtraem; entradas (1,2,3,4) somam
  v_multiplicador := CASE WHEN p_tipo_apontamento IN (5, 6) THEN -1.0 ELSE 1.0 END;

  -- Para pedras: p_peso_gramas (gramas reais); para metal: p_qtd ja e gramas
  v_peso_real := COALESCE(p_peso_gramas, p_qtd);

  SELECT id INTO v_item_existente
  FROM alissonerp.itens_ordem_insumos
  WHERE ordem_id = p_ordem_id AND insumo_id = p_insumo_id;

  IF v_item_existente IS NOT NULL THEN
    UPDATE alissonerp.itens_ordem_insumos
    SET peso       = peso + (v_peso_real * v_multiplicador),
        updated_at = now()
    WHERE id = v_item_existente;
  ELSE
    INSERT INTO alissonerp.itens_ordem_insumos (ordem_id, deposito_id, insumo_id, peso)
    VALUES (p_ordem_id, p_deposito_id, p_insumo_id, v_peso_real * v_multiplicador);
  END IF;
END;
$$;

-- ======================================================
-- PARTE 2: fn_processar_apontamento_pcp
-- Passa p_peso_gramas ao chamar fn_criar_itens_ordem
-- para tipos 3 e 6 (pedras).
-- Tipos 1,2,4,5,7: sem mudanca (p_peso_gramas=NULL -> COALESCE usa p_qtd)
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_pcp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ordem_id            INTEGER;
  v_marcador            alissonerp.enum_marcador_estoque;
  v_peso_pedra_unitario REAL;
  v_dep_almox           INTEGER := 1;
  v_peso_ct             NUMERIC(10,4);
  v_peso_gramas_itens   REAL;
BEGIN
  SELECT p.ordem_id INTO v_ordem_id
  FROM alissonerp.pcp p WHERE p.id = NEW.pcp_id;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'PCP % nao encontrado ou sem ordem vinculada', NEW.pcp_id;
  END IF;

  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra_unitario
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra_unitario := 0;
  END IF;

  CASE NEW.tipo_apontamento_id

    WHEN 1 THEN
      v_marcador := 'AD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 2 THEN
      v_marcador := 'EM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 3 THEN
      v_marcador := 'EP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      END IF;
      IF COALESCE(v_peso_pedra_unitario, 0) > 0 THEN
        INSERT INTO alissonerp.pedras_ordens (ordem_id, deposito_id, peso, peso_pedra, qtd_pedras)
        VALUES (v_ordem_id, NEW.deposito_id, v_peso_pedra_unitario * NEW.qtd, v_peso_pedra_unitario, NEW.qtd);
      END IF;

    WHEN 4 THEN
      v_marcador := 'BI';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id, NULL, 1
      );

    WHEN 5 THEN
      v_marcador := 'RM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET retorno_metal = retorno_metal + NEW.qtd WHERE id = NEW.pcp_id;

    WHEN 6 THEN
      v_marcador := 'RP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, v_ordem_id, NULL, 1
        );
        UPDATE alissonerp.pcp SET
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (COALESCE(v_peso_pedra_unitario, 0) * NEW.qtd)
        WHERE id = NEW.pcp_id;
      END IF;

    WHEN 7 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado no PCP', NEW.tipo_apontamento_id;
  END CASE;

  -- Flow 1001: atualizar itens_ordem_insumos para tipos 1-6
  -- Para pedras (3,6): p_peso_gramas = qtd x peso_pedra_unitario (gramas)
  -- Para metal (1,2,4,5): p_peso_gramas=NULL -> COALESCE usa p_qtd (ja e gramas)
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    v_peso_gramas_itens := CASE
      WHEN NEW.tipo_apontamento_id IN (3, 6) AND COALESCE(v_peso_pedra_unitario, 0) > 0
        THEN v_peso_pedra_unitario * NEW.qtd
      ELSE NULL
    END;
    PERFORM alissonerp.fn_criar_itens_ordem(
      v_ordem_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id,
      v_peso_gramas_itens
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ======================================================
-- PARTE 3: fn_processar_transferencia
-- Adiciona p_local_id = 1 na chamada fn_criar_par_movimentacao
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ordem   RECORD;
  v_item    RECORD;
BEGIN
  IF NEW.setor_id IS NULL OR NEW.deposito_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.setor_id IS NOT NULL AND OLD.deposito_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT local_atual, setor_atual INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

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
        'Transferencia PCP #' || NEW.pcp_id::text,
        1
      );
    END LOOP;
  END IF;

  UPDATE alissonerp.ordens
  SET setor_atual = NEW.setor_id,
      local_atual = NEW.deposito_id,
      updated_at  = now()
  WHERE id = NEW.ordem_id;

  UPDATE alissonerp.pcp
  SET etapas     = 'em_andamento',
      updated_at = now()
  WHERE id = NEW.pcp_id;

  INSERT INTO alissonerp.transferencias_ordem (pcp_id, ordem_id)
  VALUES (NEW.pcp_id, NEW.ordem_id);

  RETURN NEW;
END;
$$;

-- ======================================================
-- PARTE 4: fn_processar_lancamento_avulso
-- Adiciona local_estoque_id = 1 em todos os INSERTs de CE
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dep_almox   INTEGER := 1;
  v_dep_destino INTEGER;
BEGIN
  CASE NEW.tipo_lancamento::text

    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Deposito obrigatorio para transferencia avulsa';
      END IF;
      v_dep_destino := COALESCE(NEW.deposito_destino_id, v_dep_almox);
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_destino, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs, 1
      );

    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, 1);

    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, 1);

    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by, local_estoque_id)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by, 1);

    ELSE
      RAISE EXCEPTION 'Tipo de lancamento nao reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$$;

COMMIT;
