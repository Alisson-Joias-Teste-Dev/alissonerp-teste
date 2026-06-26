-- Migration 098: Triggers pedras CT + compras local
-- Sprint 2 v2.14.0 | 28/03/2026
--
-- Funções modificadas (CREATE OR REPLACE — mantém trigger bindings):
--   fn_criar_par_movimentacao  — add p_local_id (10º param, DEFAULT NULL)
--   fn_processar_apontamento_pcp — tipos 3/6 com peso_ct; todos CEs com local=1
--   fn_processar_saida_ordem   — SP pedras em ct; todos CEs com local=1
--   fn_calcular_item_compra    — pedras: peso_ct × custo_por_ct
--   fn_concluir_compra         — CE usa local_destino_id; pedras em ct; guard status
--   fn_processar_apontamento_dist — tipos 3/6 com peso_ct; todos CEs com local=1
--   fn_processar_fechamento_dist — acumula pcp.total_pedras_ct; TEDD com local=1
--
-- NÃO TOCADOS (hash verificado pós-deploy):
--   fn_concluir_protocolo      (hash baseline: ec262683016c2141bce064ec38f486ea)
--   fn_processar_auditoria     (hash baseline: a586826997268602f4f6b65c9a75005c)
--
-- fn_concluir_distribuicao: deliberadamente SEM CEs (design decision — ZERO INSERT)

BEGIN;

-- ══════════════════════════════════════════════════════════
-- PARTE 0: Schema additions necessárias para os triggers
-- ══════════════════════════════════════════════════════════

ALTER TABLE alissonerp.distribuicoes
  ADD COLUMN IF NOT EXISTS total_pedras_ct NUMERIC(10,4) DEFAULT 0;

ALTER TABLE alissonerp.apontamentos_distribuicao
  ADD COLUMN IF NOT EXISTS peso_ct NUMERIC(10,4);

-- ══════════════════════════════════════════════════════════
-- PARTE 1: fn_criar_par_movimentacao
-- Adiciona p_local_id como 10º parâmetro (DEFAULT NULL)
-- Backward compat: callers existentes sem 10º arg recebem NULL
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_criar_par_movimentacao(
  p_insumo_id   integer,
  p_quantidade  real,
  p_dep_origem  integer,
  p_set_origem  integer,
  p_dep_destino integer,
  p_set_destino integer,
  p_marcador    alissonerp.enum_marcador_estoque,
  p_ordem_id    integer DEFAULT NULL,
  p_obs         text    DEFAULT NULL,
  p_local_id    integer DEFAULT NULL
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
     p_marcador, p_ordem_id, p_obs, p_local_id);

  INSERT INTO alissonerp.movimentacoes_estoque
    (saida, entrada, insumo_id, deposito_id, setor_id,
     marcador, ordem_id, obs, local_estoque_id)
  VALUES
    (0, p_quantidade, p_insumo_id, p_dep_destino, p_set_destino,
     p_marcador, p_ordem_id, p_obs, p_local_id);
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 2: fn_processar_apontamento_pcp
-- MUDANÇAS:
--   - Tipo 3 (EP): usa NEW.peso_ct se disponível; acumula pcp.total_pedras_ct
--   - Tipo 6 (RP): mesma lógica espelhada
--   - Todos os PERFORM fn_criar_par_movimentacao passam p_local_id = 1
--   - Backward compat: se peso_ct IS NULL usa qtd (gramas)
-- ══════════════════════════════════════════════════════════

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
BEGIN
  -- Buscar ordem_id via PCP
  SELECT p.ordem_id INTO v_ordem_id
  FROM alissonerp.pcp p WHERE p.id = NEW.pcp_id;

  IF v_ordem_id IS NULL THEN
    RAISE EXCEPTION 'PCP % nao encontrado ou sem ordem vinculada', NEW.pcp_id;
  END IF;

  -- Buscar peso_pedra do insumo (usado nos tipos 3 e 6)
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
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 2: Entrada de Metal (EM) → Dep1→DepOrdem
    WHEN 2 THEN
      v_marcador := 'EM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        v_dep_almox, NULL,
        NEW.deposito_id, NEW.setor_id,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET total_metal = total_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 3: Entrada de Pedra (EP) → Dep1→DepOrdem
    WHEN 3 THEN
      v_marcador := 'EP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo fluxo: CE em ct
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
        -- Backward compat: CE em gramas (qtd)
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
      -- Flow 1005: criar registro em pedras_ordens (inalterado)
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
        v_marcador, v_ordem_id, NULL, 1
      );

    -- TIPO 5: Retorno de Metal (RM) → DepOrdem→Dep1
    WHEN 5 THEN
      v_marcador := 'RM';
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.qtd,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        v_marcador, v_ordem_id, NULL, 1
      );
      UPDATE alissonerp.pcp SET retorno_metal = retorno_metal + NEW.qtd WHERE id = NEW.pcp_id;

    -- TIPO 6: Retorno de Pedra (RP) → DepOrdem→Dep1
    WHEN 6 THEN
      v_marcador := 'RP';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo fluxo: CE em ct (retorno)
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
        -- Backward compat
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

    -- TIPO 7: Ocorrência — SEM CE
    WHEN 7 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado no PCP', NEW.tipo_apontamento_id;
  END CASE;

  -- Flow 1001: atualizar itens_ordem_insumos para tipos 1-6 (inalterado)
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_itens_ordem(
      v_ordem_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 3: fn_processar_saida_ordem
-- MUDANÇAS:
--   - Todos os CEs passam p_local_id = 1
--   - SP (pedras, cat=2): CE em ct se peso_pedra_ct disponível, senão em gramas
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_saida_ordem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pcp          RECORD;
  v_item         RECORD;
  v_pmc          REAL;
  v_quebra       REAL;
  v_pct          REAL;
  v_ordem        RECORD;
  v_ourives_nome TEXT;
  v_saida_val    REAL;
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
    SELECT ioi.insumo_id, ioi.peso, ioi.deposito_id,
           ins.categoria_id, ins.peso_pedra_ct
    FROM alissonerp.itens_ordem_insumos ioi
    JOIN alissonerp.insumos ins ON ins.id = ioi.insumo_id
    WHERE ioi.ordem_id = NEW.ordem_id AND ioi.peso > 0
  LOOP
    IF v_item.categoria_id = 1 THEN
      -- SM: metal em gramas (inalterado)
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_item.peso,
        v_item.deposito_id, NULL, NULL, NULL,
        'SM', NEW.ordem_id,
        'Saida ordem → saida_id #' || NEW.id::text,
        1
      );
    ELSE
      -- SP: pedras em ct se peso_pedra_ct disponível (1 ct = 0.2 g)
      IF v_item.categoria_id = 2
         AND v_item.peso_pedra_ct IS NOT NULL
         AND v_item.peso_pedra_ct > 0 THEN
        v_saida_val := v_item.peso / 0.2;
      ELSE
        v_saida_val := v_item.peso;  -- backward compat: gramas
      END IF;
      PERFORM alissonerp.fn_criar_par_movimentacao(
        v_item.insumo_id, v_saida_val,
        v_item.deposito_id, NULL, NULL, NULL,
        'SP', NEW.ordem_id,
        'Saida ordem → saida_id #' || NEW.id::text,
        1
      );
    END IF;
  END LOOP;

  -- Concluir PCP (inalterado)
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

  -- Concluir ordem (inalterado)
  UPDATE alissonerp.ordens SET
    status         = 'concluido',
    data_conclusao = now(),
    updated_at     = now()
  WHERE id = NEW.ordem_id;

  -- Dados complementares (inalterado)
  SELECT * INTO v_ordem FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT up.name INTO v_ourives_nome
  FROM public.user_profiles up
  WHERE up.id_user = v_pcp.operador;

  -- Criar auditoria FÁBRICA (inalterado)
  IF NOT EXISTS (
    SELECT 1 FROM alissonerp.auditorias
    WHERE ordem_id = NEW.ordem_id
      AND tipo_auditoria = 'fabrica'
      AND situacao != 'reprovado'
  ) THEN
    INSERT INTO alissonerp.auditorias (
      situacao, tipo_auditoria, rota_processo, ordem_id,
      peso_negociado, peso_final, pmc,
      quebra, quebra_percentual,
      total_metal, retorno_metal, metal_externo,
      ourives_nome
    ) VALUES (
      'pendente',
      'fabrica',
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
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 4: fn_calcular_item_compra
-- MUDANÇAS:
--   - Pedras (cat=2): valor_total = peso_ct × custo_por_ct
--   - Outros: valor_total = qtd × valor_unitario (como antes)
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cat INTEGER;
BEGIN
  SELECT categoria_id INTO v_cat
  FROM alissonerp.insumos WHERE id = NEW.insumo_id;

  IF v_cat = 2
     AND NEW.peso_ct IS NOT NULL AND NEW.peso_ct > 0
     AND NEW.custo_por_ct IS NOT NULL AND NEW.custo_por_ct > 0 THEN
    -- Pedras: preço total em ct
    NEW.valor_total := ROUND((NEW.peso_ct * NEW.custo_por_ct)::numeric, 2);
  ELSE
    -- Padrão: qtd × valor_unitário
    NEW.valor_total := ROUND(
      (COALESCE(NEW.qtd, 0) * COALESCE(NEW.valor_unitario, 0))::numeric,
      2
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 5: fn_concluir_compra
-- MUDANÇAS:
--   - CE incluí local_estoque_id = local_destino_id (default 1)
--   - Pedras: CE usa peso_ct | Outros: CE usa qtd
--   - Guard: OLD.situacao deve ser 'rascunho' ou 'recebida'
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item     RECORD;
  v_entrada  REAL;
  v_local_id INTEGER;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  -- Guard: transição de status válida
  IF TG_OP = 'UPDATE' AND OLD.situacao NOT IN ('rascunho', 'recebida') THEN
    RAISE EXCEPTION 'Compra #% precisa estar em rascunho ou recebida para concluir (status atual: %)',
      OLD.id, OLD.situacao;
  END IF;

  -- Local de destino: usa local_destino_id se preenchido, senão Fábrica (1)
  v_local_id := COALESCE(NEW.local_destino_id, 1);

  FOR v_item IN
    SELECT ic.*, i.categoria_id
    FROM alissonerp.itens_compra ic
    JOIN alissonerp.insumos i ON i.id = ic.insumo_id
    WHERE ic.compra_id = NEW.id
  LOOP
    -- Pedras: CE em ct | Outros: CE em qtd (gramas/ml/un)
    IF v_item.categoria_id = 2
       AND v_item.peso_ct IS NOT NULL
       AND v_item.peso_ct > 0 THEN
      v_entrada := v_item.peso_ct;
    ELSE
      v_entrada := v_item.qtd;
    END IF;

    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, saida, insumo_id, deposito_id,
       marcador, obs, preco_compra, valor_total, local_estoque_id)
    VALUES
      (v_entrada, 0, v_item.insumo_id,
       COALESCE(v_item.deposito_id, 1),
       'EA'::alissonerp.enum_marcador_estoque,
       'Entrada via compra #' || NEW.id,
       v_item.valor_unitario, v_item.valor_total,
       v_local_id);
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra WHERE compra_id = NEW.id;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 6: fn_processar_apontamento_dist
-- MUDANÇAS:
--   - Tipo 3 (EPD): usa peso_ct quando disponível; acumula distribuicoes.total_pedras_ct
--   - Tipo 6 (RPD): mesma lógica espelhada
--   - Todos os PERFORM passam p_local_id = 1
--   - Tipo 8: INSERT direto com local_estoque_id = 1
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_apontamento_dist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_marcador   alissonerp.enum_marcador_estoque;
  v_dep_almox  INTEGER := 1;
  v_peso_pedra REAL;
  v_peso_ct    NUMERIC(10,4);
BEGIN
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
        v_marcador, NULL, NULL, 1
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
        v_marcador, NULL, NULL, 1
      );
      UPDATE alissonerp.distribuicoes
      SET total_metal = total_metal + NEW.qtd, updated_at = now()
      WHERE id = NEW.distribuicao_id;

    -- TIPO 3: Entrada pedra (EPD) → Dep1 → DepDist
    WHEN 3 THEN
      v_marcador := 'EPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo: CE em ct
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          v_dep_almox, NULL,
          NEW.deposito_id, NEW.setor_id,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) + v_peso_ct,
          total_pedras_un = total_pedras_un + NEW.qtd,
          total_pedras_g  = total_pedras_g  + (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        -- Backward compat: CE em gramas
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

    -- TIPO 5: Retorno metal (RMD) → DepDist → Dep1
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

    -- TIPO 6: Retorno pedra (RPD) → DepDist → Dep1
    WHEN 6 THEN
      v_marcador := 'RPD';
      v_peso_ct  := NEW.peso_ct;
      IF v_peso_ct IS NOT NULL AND v_peso_ct > 0 THEN
        -- Novo: CE em ct (retorno)
        PERFORM alissonerp.fn_criar_par_movimentacao(
          NEW.insumo_id, v_peso_ct::REAL,
          NEW.deposito_id, NEW.setor_id,
          v_dep_almox, NULL,
          v_marcador, NULL, NULL, 1
        );
        UPDATE alissonerp.distribuicoes SET
          total_pedras_ct = COALESCE(total_pedras_ct, 0) - v_peso_ct,
          total_pedras_un = total_pedras_un - NEW.qtd,
          total_pedras_g  = total_pedras_g  - (v_peso_pedra * NEW.qtd),
          updated_at      = now()
        WHERE id = NEW.distribuicao_id;
      ELSE
        -- Backward compat
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

    -- TIPO 8: Entrada outros insumos (EOID) — saída direta do almox
    WHEN 8 THEN
      v_marcador := 'EOID';
      INSERT INTO alissonerp.movimentacoes_estoque
        (saida, entrada, insumo_id, deposito_id, marcador, local_estoque_id)
      VALUES
        (NEW.qtd, 0, NEW.insumo_id, v_dep_almox, v_marcador, 1);

    -- TIPO 9: Ocorrência distribuição — sem CE
    WHEN 9 THEN
      NULL;

    ELSE
      RAISE NOTICE 'Tipo apontamento % nao tratado na distribuicao', NEW.tipo_apontamento_id;

  END CASE;

  -- Flow 1011: upsert item da distribuição (tipos 1-6) — inalterado
  IF NEW.tipo_apontamento_id BETWEEN 1 AND 6 AND NEW.insumo_id IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_item_distribuicao(
      NEW.distribuicao_id, NEW.insumo_id, NEW.deposito_id, NEW.qtd, NEW.tipo_apontamento_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 7: fn_processar_fechamento_dist
-- MUDANÇAS:
--   - Acumula pcp.total_pedras_ct (derivado de total_pedras_g / 0.2)
--   - CE TEDD passa p_local_id = 1
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION alissonerp.fn_processar_fechamento_dist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pcp_id   INTEGER;
  v_dep_dist INTEGER;
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
    -- Novo: acumular ct (deriva de g / 0.2, 1ct = 0.2g)
    total_pedras_ct = COALESCE(total_pedras_ct, 0)
                    + CASE WHEN COALESCE(NEW.total_pedras_g, 0) > 0
                           THEN ROUND((NEW.total_pedras_g / 0.2)::numeric, 4)
                           ELSE 0
                      END,
    updated_at      = now()
  WHERE id = v_pcp_id;

  -- CE marcador TEDD (dep distribuição → dep1) usando insumo Ouro (id=1) como proxy
  IF v_dep_dist IS NOT NULL THEN
    PERFORM alissonerp.fn_criar_par_movimentacao(
      1, NEW.peso,
      v_dep_dist, NULL,
      1, NULL,
      'TEDD', NEW.ordem_id,
      'Fechamento distribuicao #' || NEW.distribuicao_id::text || ' → PCP',
      1
    );
  END IF;

  -- Mover ordem para almoxarifado (local_atual = 1) — inalterado
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
$$;

-- ══════════════════════════════════════════════════════════
-- PARTE 8: Remover overload antigo de fn_criar_par_movimentacao (9 params)
-- O novo tem 10 params com p_local_id DEFAULT NULL — callers com 9 args funcionam
-- ══════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS alissonerp.fn_criar_par_movimentacao(
  integer, real, integer, integer, integer, integer,
  alissonerp.enum_marcador_estoque, integer, text
);

-- ══════════════════════════════════════════════════════════
-- PARTE 9: fn_concluir_distribuicao
-- NÃO MODIFICADA — deliberadamente sem CEs (design decision)
-- "CE TEDMD e TEDPD removidos — conclusão do lote é só administrativa"
-- ══════════════════════════════════════════════════════════
-- (nenhuma instrução — trigger permanece inalterado)

COMMIT;
