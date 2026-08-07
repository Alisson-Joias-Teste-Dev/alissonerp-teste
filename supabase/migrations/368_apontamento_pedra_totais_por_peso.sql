-- =============================================================================
-- MIGRATION 368: totais de pedra da ordem no apontamento POR PESO
--
-- CONTEXTO
--   Pedra tem duas unidades no sistema, de proposito:
--     * ESTOQUE  -> quilate (ct). E como a pedra entra por compra e sai por
--                   apontamento; a movimentacao de estoque e sempre em ct.
--     * ORDEM    -> grama. No fim o Alisson precisa do peso REAL da joia para
--                   saber quanto dela e ouro e quanto e pedra.
--   Por isso a tela de apontamento pede o peso na balanca (grama) e o sistema
--   converte para ct (1 ct = 0,2 g). O apontamento guarda os dois:
--   apontamentos_pcp.qtd = GRAMA e apontamentos_pcp.peso_ct = QUILATE.
--
-- O DEFEITO QUE ESTA MIGRATION CORRIGE
--   Os gatilhos foram escritos quando `qtd` era QUANTIDADE DE PECAS, e ficaram
--   com a formula `peso_pedra_unitario x qtd` para achar o grama. No fluxo por
--   peso, `qtd` JA E o grama -> a conta virou grama x grama.
--   Medido: apontando 0,17 g de pedras de 0,085 g, a ordem registrava
--   total_pedras_g = 0,01445 (0,085 x 0,17) em vez de 0,17. Doze vezes menor.
--   E total_pedras_un, que quer contar PECAS, recebia o grama (0,17 "pecas").
--
--   Mesmo defeito em quatro lugares por funcao: o UPDATE do tipo 3 (entrada),
--   o do tipo 6 (retorno), o INSERT em pedras_ordens e o peso mandado para
--   itens_ordem_insumos.
--
-- COMO FICA
--   total_pedras_ct -> inalterado, ja estava certo (+/- peso_ct)
--   total_pedras_g  -> +/- NEW.qtd            (no fluxo por peso qtd E o grama)
--   total_pedras_un -> +/- pecas derivadas do peso
--
--   ARREDONDAMENTO (decisao do Alisson, 07/08/2026): a balanca quase nunca
--   fecha um numero redondo de pedras (2,43 g de pedras de 1,2 g = 2,025 pecas).
--   A regra e "sempre pra menos" -- e melhor a ordem contar pedra a menos do que
--   a mais. Arredonda PRA BAIXO nas DUAS pontas, e total_pedras_un nunca desce
--   abaixo de zero.
--   POR QUE NAO ARREDONDAR O RETORNO PRA CIMA: parece mais conservador, mas
--   quebra o caso simples. Medido: 0,20 g de pedras de 0,085 g = 2,3529 pecas;
--   entrando pra baixo (2) e voltando pra cima (3), a mesma pedra que entra e
--   volta deixa a ordem com -1 peca. Pra baixo nos dois lados fecha em zero.
--   O ct e o grama sao exatos e nao dependem disso; so a CONTAGEM de pecas e
--   derivada, e por isso e ela que leva a trava do zero.
--
-- O RAMO ANTIGO (peso_ct nulo ou zero) FICA INTOCADO
--   La `qtd` continua sendo peca e a formula antiga continua correta. Em
--   producao todos os 15 apontamentos de pedra existentes sao desse ramo.
--
-- IMPACTO SE FOR REVERTIDA
--   Toda ordem com pedra volta a registrar o peso de pedra errado, e o calculo
--   de "quanto da joia e ouro" passa a mentir.
--
-- SEM ALTERACAO DE SCHEMA: so as duas funcoes de gatilho.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_processar_apontamento_pcp
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_pcp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ordem_id            INTEGER;
  v_marcador            alissonerp.enum_marcador_estoque;
  v_peso_pedra_unitario REAL;
  v_dep_almox           INTEGER := 1;
  v_peso_ct             NUMERIC(10,4);
  v_peso_gramas_itens   REAL;
  -- Pecas derivadas do peso apontado. Ver nota de arredondamento no cabecalho.
  v_qtd_pecas           INTEGER;
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

    -- TIPO 3: Entrada de Pedra (EP) -> Almoxarifado -> deposito da ordem
    WHEN 3 THEN
      v_marcador := 'EP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Fluxo por peso: a movimentacao de estoque sai em ct.
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, v_ordem_id, NULL, 1
        );
        -- ENTRADA arredonda PRA BAIXO: nunca creditar peca a mais na ordem.
        v_qtd_pecas := CASE
          WHEN COALESCE(v_peso_pedra_unitario, 0) > 0
            THEN FLOOR(NEW.qtd / v_peso_pedra_unitario)::INTEGER
          ELSE 0
        END;
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + v_qtd_pecas,
          total_pedras_g  = total_pedras_g  + NEW.qtd
        WHERE id = NEW.pcp_id;
      ELSE
        -- Fluxo antigo: qtd e PECA, movimentacao em gramas. Inalterado.
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

      -- Flow 1005: registro em pedras_ordens.
      -- `peso` e o peso TOTAL de pedra e `qtd_pedras` a contagem de pecas --
      -- os dois seguem a mesma regra dos totais acima.
      IF COALESCE(v_peso_pedra_unitario, 0) > 0 THEN
        IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
          INSERT INTO alissonerp.pedras_ordens (ordem_id, deposito_id, peso, peso_pedra, qtd_pedras)
          VALUES (v_ordem_id, NEW.deposito_id, NEW.qtd, v_peso_pedra_unitario, v_qtd_pecas);
        ELSE
          INSERT INTO alissonerp.pedras_ordens (ordem_id, deposito_id, peso, peso_pedra, qtd_pedras)
          VALUES (v_ordem_id, NEW.deposito_id, v_peso_pedra_unitario * NEW.qtd, v_peso_pedra_unitario, NEW.qtd);
        END IF;
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

    -- TIPO 6: Retorno de Pedra (RP) -> deposito da ordem -> Almoxarifado
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
        -- RETORNO arredonda PRA BAIXO tambem, e a contagem nunca fica negativa:
        -- a mesma pedra que entrou tem que zerar ao voltar (ver cabecalho).
        v_qtd_pecas := CASE
          WHEN COALESCE(v_peso_pedra_unitario, 0) > 0
            THEN FLOOR(NEW.qtd / v_peso_pedra_unitario)::INTEGER
          ELSE 0
        END;
        UPDATE alissonerp.pcp SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = GREATEST(COALESCE(total_pedras_un, 0) - v_qtd_pecas, 0),
          total_pedras_g  = total_pedras_g  - NEW.qtd
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

  -- Flow 1001: itens_ordem_insumos guarda o peso em GRAMAS.
  --   fluxo por peso (peso_ct > 0): NEW.qtd JA e o grama
  --   fluxo antigo:                 qtd e peca -> peso_unitario x qtd
  --   metal:                        NULL -> a funcao usa p_qtd, que ja e grama
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    v_peso_gramas_itens := CASE
      WHEN NEW.tipo_apontamento_id IN (3, 6) AND COALESCE(NEW.peso_ct, 0) > 0
        THEN NEW.qtd
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_processar_apontamento_dist  (mesmo defeito, mesma correcao)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_dist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_marcador   alissonerp.enum_marcador_estoque;
  v_dep_almox  INTEGER := 1;
  v_peso_pedra REAL;
  v_peso_ct    NUMERIC(10,4);
  v_qtd_pecas  INTEGER;
BEGIN
  IF NEW.insumo_id IS NOT NULL THEN
    SELECT COALESCE(peso_pedra, 0) INTO v_peso_pedra
    FROM alissonerp.insumos WHERE id = NEW.insumo_id;
  ELSE
    v_peso_pedra := 0;
  END IF;

  CASE NEW.tipo_apontamento_id

    -- TIPO 1: Aditivo metal (ADD) -> Almoxarifado -> deposito da distribuicao
    WHEN 1 THEN
      v_marcador := 'ADD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 2: Entrada metal (EIMD)
    WHEN 2 THEN
      v_marcador := 'EIMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 3: Entrada pedra (EPD)
    WHEN 3 THEN
      v_marcador := 'EPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, NULL, NULL, 1
        );
        -- ENTRADA arredonda PRA BAIXO (ver cabecalho).
        v_qtd_pecas := CASE
          WHEN COALESCE(v_peso_pedra, 0) > 0
            THEN FLOOR(NEW.qtd / v_peso_pedra)::INTEGER
          ELSE 0
        END;
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + v_qtd_pecas,
          total_pedras_g  = total_pedras_g  + NEW.qtd,
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      END IF;

    -- TIPO 5: Retorno metal (RMD)
    WHEN 5 THEN
      v_marcador := 'RMD';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET retorno_metal = retorno_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 6: Retorno pedra (RPD)
    WHEN 6 THEN
      v_marcador := 'RPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, NULL, NULL, 1
        );
        -- RETORNO arredonda PRA BAIXO tambem, com trava no zero (ver cabecalho).
        v_qtd_pecas := CASE
          WHEN COALESCE(v_peso_pedra, 0) > 0
            THEN FLOOR(NEW.qtd / v_peso_pedra)::INTEGER
          ELSE 0
        END;
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = GREATEST(COALESCE(total_pedras_un, 0) - v_qtd_pecas, 0),
          total_pedras_g  = total_pedras_g  - NEW.qtd,
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      END IF;

    -- TIPO 8: Entrada outros insumos (EOID) -> saida direta do almoxarifado
    WHEN 8 THEN
      v_marcador := 'EOID';
      INSERT INTO alissonerp.movimentacoes_estoque
        (saida, entrada, insumo_id, deposito_id, marcador, local_estoque_id)
      VALUES
        (NEW.qtd, 0, NEW.insumo_id, v_dep_almox, v_marcador, 1);

    -- TIPO 9: Ocorrencia de distribuicao -- sem movimentacao
    WHEN 9 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado na distribuicao', NEW.tipo_apontamento_id;

  END CASE;

  -- Flow 1011: item da distribuicao (tipos 1-6). p_qtd ja chega em grama tanto
  -- no metal quanto no fluxo por peso da pedra -- inalterado.
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_item_distribuicao(
      NEW.distribuicao_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
