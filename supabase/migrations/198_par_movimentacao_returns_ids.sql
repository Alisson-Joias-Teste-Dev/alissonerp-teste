-- Migration 198: fn_criar_par_movimentacao agora retorna (saida_id, entrada_id)
-- Backward-compatible: chamadas que descartam o retorno (SELECT fn...) continuam funcionando.
--
-- NOTA: CREATE OR REPLACE não pode alterar tipo de retorno (void -> TABLE) no PostgreSQL.
-- DROP+CREATE é necessário aqui. Verificado: zero dependências externas na função.
-- Executado dentro de transação para garantir atomicidade.

BEGIN;

DROP FUNCTION IF EXISTS alissonerp.fn_criar_par_movimentacao(
  integer, real, integer, integer, integer, integer,
  alissonerp.enum_marcador_estoque, integer, text, integer
);

CREATE FUNCTION alissonerp.fn_criar_par_movimentacao(
  p_insumo_id integer,
  p_quantidade real,
  p_dep_origem integer,
  p_set_origem integer,
  p_dep_destino integer,
  p_set_destino integer,
  p_marcador alissonerp.enum_marcador_estoque,
  p_ordem_id integer DEFAULT NULL,
  p_obs text DEFAULT NULL,
  p_local_id integer DEFAULT NULL
) RETURNS TABLE(saida_id bigint, entrada_id bigint)
LANGUAGE plpgsql AS $function$
DECLARE
  v_saida_id  bigint;
  v_entrada_id bigint;
BEGIN
  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (p_quantidade, 0, p_insumo_id, p_dep_origem, p_set_origem,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1))
  RETURNING id INTO v_saida_id;

  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id, marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (0, p_quantidade, p_insumo_id, p_dep_destino, p_set_destino,
     p_marcador, p_ordem_id, p_obs, COALESCE(p_local_id, 1))
  RETURNING id INTO v_entrada_id;

  RETURN QUERY SELECT v_saida_id, v_entrada_id;
END;
$function$;

COMMIT;
