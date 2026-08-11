-- =============================================================================
-- MIGRATION 371: movimentacao de estoque de PEDRA passa a ser gravada em GRAMA
--
-- 🔴 LEIA O CONTEXTO ANTES DE MEXER. Esta migration CORRIGE A PREMISSA da 368.
--
-- O QUE A 368 ASSUMIU (e estava errado)
--   O cabecalho da 368 declara:
--     "ESTOQUE -> quilate (ct). E como a pedra entra por compra e sai por
--      apontamento; a movimentacao de estoque e sempre em ct."
--   A justificativa e "a pedra entra por COMPRA". Ela NAO entra.
--   Confirmado pelo Jonathan em 11/08/2026: a pedra entra no estoque pela tela
--   de Lancamento Avulso > Entrada Avulsa, e essa tela grava o peso em GRAMA
--   (`fn_processar_lancamento_avulso` insere NEW.peso cru, cego a categoria).
--   Compra de pedra nao e usada como via de entrada.
--
-- O DEFEITO QUE ISSO CRIOU
--   O saldo de pedra e FORMADO em grama (entradas avulsas) e era CONSUMIDO em
--   quilate (apontamento) -- 5x a mais, porque 1 ct = 0,2 g.
--   Medido no PD1019 (Moissante 3mm), PCP #1130, 11/08/2026:
--     saldo no Almoxarifado ........ 0,414 g   (= 2,07 ct = 20 pedras)
--     baixa que o gatilho gravaria .. 2,07     (o ct, tratado como se fosse g)
--     saldo resultante ............. -1,656    NEGATIVO
--   E o deposito do operador recebia +2,07 num razao lido em grama, aparecendo
--   como 10,35 ct na tela de Estoque (2,07 / 0,2) -- cinco vezes o real.
--
-- QUEM MAIS LE ESSA COLUNA JA A TRATA COMO GRAMA (nada muda para eles)
--   * migration 122, a mais nova a definir as views de saldo:
--       ROUND((SUM(entrada) - SUM(saida)) / 0.2, 4) AS saldo_ct
--   * EstoqueClient.tsx:394:
--       formatPesoCt(Number(s.total_entrada) / 0.2)
--   Confere com a tela: 0,414 / 0,2 = 2,07 ct e 0,414 / 0,0206 = 20 un, que e
--   exatamente o que o Estoque mostra hoje para o PD1019.
--
-- A REGRA DO ALISSON CONTINUA VALENDO -- ela e sobre a unidade que o HUMANO usa
--   "Estoque de pedra = quilate" segue verdade na TELA: o campo da Entrada
--   Avulsa pede ct e o Estoque exibe ct. O que muda aqui e so o ARMAZENAMENTO,
--   que passa a ser grama de ponta a ponta. Humano em ct, banco em grama,
--   conversao num lugar so (src/lib/pedra-unidade-estoque.ts).
--
-- O QUE MUDA -- QUATRO LINHAS, DUAS FUNCOES
--   fn_processar_apontamento_pcp  tipos 3 (EP) e 6 (RP)
--   fn_processar_apontamento_dist tipos 3 (EPD) e 6 (RPD)
--   Em cada um, no ramo do fluxo por peso (peso_ct > 0), o valor passado para
--   fn_criar_par_movimentacao deixa de ser `v_peso_ct::REAL` e passa a ser
--   `NEW.qtd`, que nessa coluna JA E O PESO EM GRAMAS (a rota grava
--   qtd = peso_g_pedra; ver 368 e o comentario da coluna).
--
--   NADA MAIS MUDA. Seguem intocados, porque estao corretos:
--     * total_pedras_ct  -> continua acumulando em ct (a ORDEM fala em ct)
--     * total_pedras_g   -> continua NEW.qtd
--     * total_pedras_un  -> continua a contagem de pecas com FLOOR
--     * pedras_ordens, itens_ordem_insumos, fn_criar_item_distribuicao
--     * o ramo ELSE (peso_ct nulo) -- ele JA passava NEW.qtd, sempre esteve certo
--   O corpo das duas funcoes foi copiado byte a byte da 368; so as 4 linhas
--   acima diferem (conferido por diff no momento da escrita).
--
-- ⚠️ O QUE ESTA MIGRATION NAO FAZ -- FICA PENDENTE, DE PROPOSITO
--   1. NAO normaliza o dado que ja esta gravado. Em 07/08/2026, 102
--      movimentacoes de pedra em producao foram multiplicadas x5 (grama -> ct).
--      Se ainda estiverem assim, estao em ct e desalinhadas das views. Corrigir
--      isso exige CONTAR no banco primeiro -- e o banco esteve inacessivel
--      quando esta migration foi escrita (portas 5432/5433/5543/6543 sem
--      resposta). Rodar o levantamento antes de qualquer UPDATE.
--   2. NAO toca `fn_processar_saida_ordem`, que tem o MESMO defeito
--      (098: `v_saida_val := v_item.peso / 0.2` quando categoria_id = 2), nem
--      `fn_concluir_compra` (pedras em ct no fluxo de compra). Ficaram fora
--      para manter esta migration pequena e revisavel; a saida de ordem drena o
--      mesmo saldo e deve ser a proxima.
--
-- ANTES DE APLICAR EM PRODUCAO -- OBRIGATORIO
--   1. Assinar:
--        SELECT alissonerp.assinar_mudanca_banco('jonathan','claude-code',
--          'Movimentacao de estoque de pedra passa de ct para grama nos gatilhos de apontamento (PCP e Distribuicao)',
--          'CREATE OR REPLACE fn_processar_apontamento_pcp + fn_processar_apontamento_dist');
--   2. Salvar o rollback com a definicao VIVA das duas funcoes (nao confiar no
--      arquivo -- alguem pode ter alterado a funcao a mao no banco):
--        SELECT pg_get_functiondef(oid) FROM pg_proc
--        WHERE proname IN ('fn_processar_apontamento_pcp','fn_processar_apontamento_dist');
--   3. Conferir o ambiente (SELECT inet_server_addr(), current_database()).
--
-- IMPACTO SE FOR REVERTIDA
--   Todo apontamento de pedra por peso volta a dar baixa 5x maior que o real e
--   o Almoxarifado volta a ficar com saldo negativo de pedra.
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
        -- Fluxo por peso: a movimentacao de estoque sai em GRAMA (NEW.qtd). Ver cabecalho.
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, NEW.qtd,
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
          NEW.insumo_id, NEW.qtd,
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
          NEW.insumo_id, NEW.qtd,
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
          NEW.insumo_id, NEW.qtd,
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
