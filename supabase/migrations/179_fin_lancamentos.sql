SET search_path TO alissonerp, public;

-- ─── Tabela de lançamentos financeiros (dupla entrada) ─────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.fin_lancamentos (
  id          BIGSERIAL PRIMARY KEY,
  tipo        VARCHAR(10)   NOT NULL CHECK(tipo IN ('debito','credito')),
  conta       VARCHAR(50),
  valor       DECIMAL(12,2) NOT NULL CHECK(valor > 0),
  data        DATE          NOT NULL DEFAULT CURRENT_DATE,
  origem_tipo VARCHAR(30),
  origem_id   BIGINT,
  venda_id    BIGINT REFERENCES alissonerp.vendas_erp(id),
  vendedor_id BIGINT,
  descricao   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_venda_id
  ON alissonerp.fin_lancamentos(venda_id);

CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_origem
  ON alissonerp.fin_lancamentos(origem_tipo, origem_id);

-- ─── Trigger: dupla entrada ao confirmar pagamento ────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_fin_lancamentos_pagamento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conta    VARCHAR(50);
  v_vendedor BIGINT;
BEGIN
  -- Só age quando status muda para 'confirmado'
  IF NEW.status <> 'confirmado' OR OLD.status = 'confirmado' THEN
    RETURN NEW;
  END IF;

  -- Idempotência: evita duplicar se já existe lançamento para este pagamento
  IF EXISTS (
    SELECT 1 FROM alissonerp.fin_lancamentos
    WHERE origem_tipo = 'pagamento_venda' AND origem_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Mapear forma → conta
  IF NEW.forma = 'Dinheiro'           THEN v_conta := 'caixa';
  ELSIF NEW.forma = 'PIX'             THEN v_conta := 'caixa';
  ELSIF NEW.forma = 'Cartão de Crédito' THEN v_conta := 'caixa';
  ELSIF NEW.forma = 'Cartão de Débito'  THEN v_conta := 'caixa';
  ELSIF NEW.forma = 'Manual (MP)'     THEN v_conta := 'mp';
  ELSIF NEW.forma = 'Ouro'            THEN v_conta := 'ouro';
  ELSIF NEW.forma = 'Vale-Troca'      THEN v_conta := 'vale_troca';
  ELSIF NEW.forma = 'A Receber'       THEN v_conta := 'a_receber';
  ELSE v_conta := 'caixa';
  END IF;

  SELECT vendedor_id INTO v_vendedor
  FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;

  -- Crédito: entrada na conta correspondente
  INSERT INTO alissonerp.fin_lancamentos
    (tipo, conta, valor, data, origem_tipo, origem_id, venda_id, vendedor_id, descricao, created_by)
  VALUES
    ('credito', v_conta, NEW.valor, CURRENT_DATE,
     'pagamento_venda', NEW.id, NEW.venda_id, v_vendedor,
     'Confirmação pagamento venda #' || NEW.venda_id, auth.uid());

  -- Débito: baixa em a_receber (exceto quando a própria forma é A Receber)
  IF NEW.forma <> 'A Receber' THEN
    INSERT INTO alissonerp.fin_lancamentos
      (tipo, conta, valor, data, origem_tipo, origem_id, venda_id, vendedor_id, descricao, created_by)
    VALUES
      ('debito', 'a_receber', NEW.valor, CURRENT_DATE,
       'pagamento_venda', NEW.id, NEW.venda_id, v_vendedor,
       'Baixa a_receber venda #' || NEW.venda_id, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_lancamentos_pagamento ON alissonerp.pagamentos_venda;
CREATE TRIGGER trg_fin_lancamentos_pagamento
  AFTER UPDATE OF status ON alissonerp.pagamentos_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_fin_lancamentos_pagamento();
