-- Migration 102: Fix local_estoque_id em funcoes de trigger
-- Data: 30/03/2026 | Sprint: fix v2.14.1
--
-- Problemas corrigidos:
--   BUG 4: fn_criar_par_movimentacao usa p_local_id direto no INSERT.
--           Qualquer caller que nao passa o 10 arg (DEFAULT NULL) viola NOT NULL.
--           Fix: COALESCE(p_local_id, 1) garante local_estoque_id nunca NULL.
--
--   BUG 5: fn_processar_outros_insumos_dist nao passava local_estoque_id no INSERT.
--           Fix: adiciona local_estoque_id = 1.
--
--   BUG 6: fn_processar_outros_insumos_pcp nao passava local_estoque_id no INSERT.
--           Fix: adiciona local_estoque_id = 1.
--
-- Backward compat total: COALESCE(p_local_id, 1) = callers existentes sem o 10 arg continuam funcionando.

BEGIN;

-- ======================================================
-- PARTE 1: fn_criar_par_movimentacao
-- Troca p_local_id por COALESCE(p_local_id, 1) nos INSERTs
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_criar_par_movimentacao(
  p_insumo_id  INTEGER,
  p_quantidade REAL,
  p_dep_origem INTEGER,
  p_set_origem INTEGER,
  p_dep_destino INTEGER,
  p_set_destino INTEGER,
  p_marcador   alissonerp.enum_marcador_estoque,
  p_ordem_id   INTEGER DEFAULT NULL,
  p_obs        TEXT    DEFAULT NULL,
  p_local_id   INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id,
     marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (p_quantidade, 0, p_insumo_id, p_dep_origem, p_set_origem,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1));

  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id,
     marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (0, p_quantidade, p_insumo_id, p_dep_destino, p_set_destino,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1));
END;
$$;

-- ======================================================
-- PARTE 2: fn_processar_outros_insumos_dist
-- Adiciona local_estoque_id = 1 no INSERT
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_dist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador, local_estoque_id)
  VALUES (NEW.peso, 0, NEW.insumo_id, 1, 'SOID', 1);

  UPDATE alissonerp.distribuicoes SET
    total_outros_pesos       = total_outros_pesos       + NEW.peso,
    total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso,
    updated_at               = now()
  WHERE id = NEW.distribuicao_id;

  RETURN NEW;
END;
$$;

-- ======================================================
-- PARTE 3: fn_processar_outros_insumos_pcp
-- Adiciona local_estoque_id = 1 no INSERT
-- ======================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_outros_insumos_pcp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (NEW.peso, 0, NEW.insumo_id, 1, 'SOI', NEW.ordem_id, 'Outros insumos PCP', 1);

  UPDATE alissonerp.pcp
  SET total_geral_outros_pesos = total_geral_outros_pesos + NEW.peso
  WHERE id = NEW.pcp_id;

  RETURN NEW;
END;
$$;

COMMIT;
