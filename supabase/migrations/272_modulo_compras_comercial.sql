-- Migration 272: módulo de compras comercial (produtos)
-- REGRA DE NEGÓCIO:
-- - O que faz: cria um fluxo separado para compras de produtos acabados (estoque comercial).
-- - Por que: evita misturar regras de insumo/fábrica com regras comerciais e reduz risco de regressão.
-- - Impacto se alterado/removido: conclusão pode parar de lançar entrada no estoque comercial
--   e contas a pagar parceladas deixam de ser geradas automaticamente.

SET search_path TO alissonerp;

-- Cabeçalho da compra comercial.
CREATE TABLE IF NOT EXISTS alissonerp.compras_comercial (
  id                 SERIAL PRIMARY KEY,
  fornecedor_id      BIGINT REFERENCES public.contatos(id_contato),
  situacao           VARCHAR(20) NOT NULL DEFAULT 'rascunho',
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  obs                TEXT,
  bloqueado          BOOLEAN NOT NULL DEFAULT false,
  local_estoque_id   INTEGER NOT NULL REFERENCES alissonerp.locais_estoque(id),
  numero_nf          VARCHAR(50),
  data_compra        DATE,
  data_recebimento   DATE,
  recebido_por       UUID REFERENCES auth.users(id),
  qtd_parcelas       INTEGER NOT NULL DEFAULT 1 CHECK (qtd_parcelas >= 1),
  primeiro_vencimento DATE NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES auth.users(id)
);

-- Itens da compra comercial (produto, quantidade e custo).
CREATE TABLE IF NOT EXISTS alissonerp.itens_compra_comercial (
  id                  SERIAL PRIMARY KEY,
  compra_comercial_id INTEGER NOT NULL REFERENCES alissonerp.compras_comercial(id) ON DELETE CASCADE,
  produto_id          INTEGER NOT NULL REFERENCES public.produtos(id_produto),
  qtd                 NUMERIC(12,3) NOT NULL CHECK (qtd > 0),
  valor_unitario      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  valor_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  obs                 TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_comercial_situacao ON alissonerp.compras_comercial(situacao);
CREATE INDEX IF NOT EXISTS idx_compras_comercial_fornecedor ON alissonerp.compras_comercial(fornecedor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compras_comercial_local ON alissonerp.compras_comercial(local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra_comercial_compra ON alissonerp.itens_compra_comercial(compra_comercial_id);
CREATE INDEX IF NOT EXISTS idx_itens_compra_comercial_produto ON alissonerp.itens_compra_comercial(produto_id);

-- Campo dedicado em contas a pagar para rastrear origem do novo módulo.
ALTER TABLE alissonerp.contas_pagar
  ADD COLUMN IF NOT EXISTS compra_comercial_id INTEGER REFERENCES alissonerp.compras_comercial(id);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_compra_comercial
  ON alissonerp.contas_pagar(compra_comercial_id)
  WHERE compra_comercial_id IS NOT NULL;

-- Updated_at padronizado no cabeçalho.
CREATE OR REPLACE FUNCTION alissonerp.fn_compras_comercial_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compras_comercial_updated_at ON alissonerp.compras_comercial;
CREATE TRIGGER trg_compras_comercial_updated_at
  BEFORE UPDATE ON alissonerp.compras_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_compras_comercial_updated_at();

CREATE OR REPLACE FUNCTION alissonerp.fn_itens_compra_comercial_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_itens_compra_comercial_updated_at ON alissonerp.itens_compra_comercial;
CREATE TRIGGER trg_itens_compra_comercial_updated_at
  BEFORE UPDATE ON alissonerp.itens_compra_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_itens_compra_comercial_updated_at();

-- Calcula valor_total de item automaticamente para evitar divergência entre UI e banco.
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.valor_total := ROUND((COALESCE(NEW.qtd, 0) * COALESCE(NEW.valor_unitario, 0))::numeric, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calcular_item_compra_comercial ON alissonerp.itens_compra_comercial;
CREATE TRIGGER trg_calcular_item_compra_comercial
  BEFORE INSERT OR UPDATE ON alissonerp.itens_compra_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_calcular_item_compra_comercial();

-- Impede editar compra já bloqueada/concluída.
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    RAISE EXCEPTION 'Compra comercial #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aa_bloquear_compra_comercial ON alissonerp.compras_comercial;
CREATE TRIGGER trg_aa_bloquear_compra_comercial
  BEFORE UPDATE ON alissonerp.compras_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_bloquear_compra_comercial();

-- Conclusão da compra comercial:
-- 1) lança entrada no estoque comercial por item
-- 2) trava compra para edição
-- 3) recalcula total consolidado
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND OLD.situacao NOT IN ('rascunho', 'recebida') THEN
    RAISE EXCEPTION 'Compra comercial #% precisa estar em rascunho ou recebida para concluir (status atual: %)',
      OLD.id, OLD.situacao;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM alissonerp.itens_compra_comercial ic
    WHERE ic.compra_comercial_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Compra comercial #% não possui itens para concluir', NEW.id;
  END IF;

  FOR v_item IN
    SELECT ic.*
    FROM alissonerp.itens_compra_comercial ic
    WHERE ic.compra_comercial_id = NEW.id
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by)
    VALUES
      (v_item.produto_id, 'entrada', v_item.qtd, 'compra_comercial', NEW.local_estoque_id, 'efetivado',
       'Entrada via compra comercial #' || NEW.id,
       COALESCE(NEW.created_by, auth.uid()));
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra_comercial
  WHERE compra_comercial_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concluir_compra_comercial ON alissonerp.compras_comercial;
CREATE TRIGGER trg_concluir_compra_comercial
  BEFORE UPDATE ON alissonerp.compras_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_concluir_compra_comercial();

-- Gera contas a pagar parceladas por mês quando a compra comercial é concluída.
CREATE OR REPLACE FUNCTION alissonerp.fn_gerar_conta_pagar_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fornecedor_nome TEXT;
  v_parcelas INTEGER;
  v_total NUMERIC(12,2);
  v_base NUMERIC(12,2);
  v_soma NUMERIC(12,2);
  v_diff NUMERIC(12,2);
  v_valor_parcela NUMERIC(12,2);
  i INTEGER;
BEGIN
  IF NEW.situacao != 'concluido' OR OLD.situacao = 'concluido' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM alissonerp.contas_pagar cp
    WHERE cp.compra_comercial_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_fornecedor_nome
  FROM public.contatos
  WHERE id_contato = NEW.fornecedor_id;

  v_parcelas := GREATEST(COALESCE(NEW.qtd_parcelas, 1), 1);
  v_total := COALESCE(NEW.total, 0);

  v_base := ROUND((v_total / v_parcelas)::numeric, 2);
  v_soma := ROUND((v_base * v_parcelas)::numeric, 2);
  v_diff := ROUND((v_total - v_soma)::numeric, 2);

  FOR i IN 1..v_parcelas LOOP
    v_valor_parcela := v_base;
    IF i = v_parcelas THEN
      -- Ajuste de centavos apenas na última parcela para manter a soma idêntica ao total.
      v_valor_parcela := ROUND((v_base + v_diff)::numeric, 2);
    END IF;

    INSERT INTO alissonerp.contas_pagar (
      descricao,
      fornecedor_id,
      fornecedor_nome,
      compra_comercial_id,
      valor,
      data_vencimento,
      situacao,
      categoria,
      created_by,
      obs
    ) VALUES (
      'Compra Comercial #' || NEW.id || ' - Parcela ' || i || '/' || v_parcelas,
      NEW.fornecedor_id,
      v_fornecedor_nome,
      NEW.id,
      v_valor_parcela,
      ((NEW.primeiro_vencimento::date + ((i - 1) || ' month')::interval))::date,
      'pendente',
      'compra_comercial',
      NEW.created_by,
      'Gerado automaticamente na conclusão da compra comercial #' || NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compra_comercial_gerar_conta_pagar ON alissonerp.compras_comercial;
CREATE TRIGGER trg_compra_comercial_gerar_conta_pagar
  AFTER UPDATE ON alissonerp.compras_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_gerar_conta_pagar_compra_comercial();

GRANT SELECT, INSERT, UPDATE ON alissonerp.compras_comercial TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.itens_compra_comercial TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.compras_comercial_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.itens_compra_comercial_id_seq TO authenticated;
