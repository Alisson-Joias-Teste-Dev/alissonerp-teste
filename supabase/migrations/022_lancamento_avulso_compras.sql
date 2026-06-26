
SET search_path TO alissonerp;

-- ═══ FLOW 1006 — LANÇAMENTO AVULSO ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_lancamento_avulso()
RETURNS TRIGGER AS $$
DECLARE
  v_dep_almox INTEGER := 1;
BEGIN
  CASE NEW.tipo_lancamento::text

    -- TRANSFERÊNCIA AVULSA (TA): dep_selecionado → dep1
    WHEN 'transferencia' THEN
      IF NEW.deposito_id IS NULL THEN
        RAISE EXCEPTION 'Depósito obrigatório para transferência avulsa';
      END IF;
      PERFORM alissonerp.fn_criar_par_movimentacao(
        NEW.insumo_id, NEW.peso,
        NEW.deposito_id, NEW.setor_id,
        v_dep_almox, NULL,
        'TA'::alissonerp.enum_marcador_estoque,
        NULL, NEW.obs
      );

    -- ENTRADA AVULSA (EA): entrada no depósito selecionado (sem par)
    WHEN 'entrada' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'EA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SAÍDA AVULSA (SA): saída do depósito selecionado (sem par)
    WHEN 'saida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (0, NEW.peso, NEW.insumo_id,
         COALESCE(NEW.deposito_id, v_dep_almox), NEW.setor_id,
         'SA'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    -- SANGRIA: entrada no almoxarifado (recolhimento)
    WHEN 'sangria' THEN
      INSERT INTO alissonerp.movimentacoes_estoque
        (entrada, saida, insumo_id, deposito_id, setor_id, marcador, obs, created_by)
      VALUES
        (NEW.peso, 0, NEW.insumo_id, v_dep_almox, NULL,
         'Sangria'::alissonerp.enum_marcador_estoque,
         NEW.obs, NEW.created_by);

    ELSE
      RAISE EXCEPTION 'Tipo de lançamento não reconhecido: %', NEW.tipo_lancamento;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_lancamento_avulso ON alissonerp.lancamentos_avulso;
CREATE TRIGGER trg_lancamento_avulso
  AFTER INSERT ON alissonerp.lancamentos_avulso
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_lancamento_avulso();

-- ═══ COMPRAS — TABELAS ═══
CREATE TABLE IF NOT EXISTS alissonerp.compras (
  id         SERIAL PRIMARY KEY,
  fornecedor_id BIGINT REFERENCES public.contatos(id_contato),
  situacao   VARCHAR(20) DEFAULT 'pendente',
  total      DECIMAL(12,3) DEFAULT 0,
  obs        TEXT,
  bloqueado  BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS alissonerp.itens_compra (
  id             SERIAL PRIMARY KEY,
  compra_id      INTEGER REFERENCES alissonerp.compras(id) ON DELETE CASCADE,
  insumo_id      INTEGER REFERENCES alissonerp.insumos(id),
  deposito_id    INTEGER REFERENCES alissonerp.depositos(id) DEFAULT 1,
  qtd            REAL NOT NULL,
  valor_unitario DECIMAL(12,2),
  valor_total    DECIMAL(12,2),
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ═══ TRIGGER: Calcular valor_total por item ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra()
RETURNS TRIGGER AS $$
BEGIN
  NEW.valor_total := COALESCE(NEW.qtd, 0) * COALESCE(NEW.valor_unitario, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calcular_item_compra ON alissonerp.itens_compra;
CREATE TRIGGER trg_calcular_item_compra
  BEFORE INSERT OR UPDATE ON alissonerp.itens_compra
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_calcular_item_compra();

-- ═══ TRIGGER: Concluir compra → CE entrada estoque ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  FOR v_item IN
    SELECT * FROM alissonerp.itens_compra WHERE compra_id = NEW.id
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, saida, insumo_id, deposito_id, marcador, obs, preco_compra, valor_total)
    VALUES
      (v_item.qtd, 0, v_item.insumo_id,
       COALESCE(v_item.deposito_id, 1),
       'EA'::alissonerp.enum_marcador_estoque,
       'Entrada via compra #' || NEW.id,
       v_item.valor_unitario, v_item.valor_total);
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra WHERE compra_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══ TRIGGER: Bloquear edição após conclusão ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao != OLD.situacao THEN
    RAISE EXCEPTION 'Compra #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- trg_aa_ roda antes de trg_concluir_ (ordem alfabética no PostgreSQL)
DROP TRIGGER IF EXISTS trg_aa_bloquear_compra ON alissonerp.compras;
CREATE TRIGGER trg_aa_bloquear_compra
  BEFORE UPDATE ON alissonerp.compras
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_bloquear_compra();

DROP TRIGGER IF EXISTS trg_concluir_compra ON alissonerp.compras;
CREATE TRIGGER trg_concluir_compra
  BEFORE UPDATE ON alissonerp.compras
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_compra();

COMMENT ON FUNCTION alissonerp.fn_processar_lancamento_avulso IS
  'Flow 1006: Branch T/E/S/Sangria → CE com marcadores TA/EA/SA/Sangria.';
COMMENT ON FUNCTION alissonerp.fn_concluir_compra IS
  'Concluir compra → CE entrada por item + bloquear edição.';
