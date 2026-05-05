-- =============================================
-- MIGRATION 202: COFRE OURO — RASTREABILIDADE TOTAL
-- =============================================
SET search_path TO alissonerp, public;

-- ═══ 1. TABELA DE BAIXAS DO COFRE ═══
CREATE TABLE IF NOT EXISTS alissonerp.cofre_ouro_baixas (
  id                 SERIAL PRIMARY KEY,
  gramas             NUMERIC(10,3) NOT NULL CHECK (gramas > 0),
  destino            VARCHAR(20) NOT NULL CHECK (destino IN ('alisson', 'fabrica', 'service')),
  status             VARCHAR(20) NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('pendente', 'em_trafego', 'concluido', 'cancelado')),
  protocolo_id       INTEGER REFERENCES alissonerp.protocolos(id) ON DELETE SET NULL,
  realizado_por      UUID REFERENCES auth.users(id),
  realizado_nome     TEXT,
  transportador_id   UUID REFERENCES auth.users(id),
  transportador_nome TEXT,
  recebedor_id       UUID REFERENCES auth.users(id),
  recebedor_nome     TEXT,
  confirmado_em      TIMESTAMPTZ,
  foto_comprovacao   TEXT,
  obs                TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ 2. TABELA DE RASTREIO (histórico completo desde a venda) ═══
CREATE TABLE IF NOT EXISTS alissonerp.cofre_ouro_rastreios (
  id             SERIAL PRIMARY KEY,
  pagamento_id   INTEGER REFERENCES alissonerp.pagamentos_venda(id) ON DELETE SET NULL,
  baixa_id       INTEGER REFERENCES alissonerp.cofre_ouro_baixas(id) ON DELETE SET NULL,
  protocolo_id   INTEGER REFERENCES alissonerp.protocolos(id) ON DELETE SET NULL,
  evento         VARCHAR(30) NOT NULL,
  gramas         NUMERIC(10,3),
  origem_nome    TEXT,
  destino_nome   TEXT,
  observacao     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ 3. VIEW DE SALDO DISPONÍVEL ═══
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro_disponivel AS
WITH c AS (
  SELECT
    COUNT(*)::integer                                             AS total_transacoes,
    COALESCE(SUM(pv.ouro_gramas), 0)                              AS total_gramas,
    COALESCE(SUM(pv.valor), 0)                                    AS total_valor_brl,
    COALESCE(AVG(pv.ouro_valor_grama) FILTER (WHERE pv.ouro_valor_grama > 0), 0) AS preco_medio_grama,
    COUNT(*) FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days')::integer  AS transacoes_30d,
    COALESCE(SUM(pv.valor) FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS valor_brl_30d
  FROM alissonerp.pagamentos_venda pv
  WHERE pv.forma = 'Ouro' AND pv.status = 'confirmado'
)
SELECT
  c.total_transacoes,
  c.total_gramas,
  c.total_gramas - COALESCE(b.baixado_gramas, 0) AS disponivel_gramas,
  c.total_valor_brl,
  c.preco_medio_grama
FROM c
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(cb.gramas), 0) AS baixado_gramas
  FROM alissonerp.cofre_ouro_baixas cb
  WHERE cb.status IN ('pendente', 'em_trafego', 'concluido')
) b;

-- ═══ 4. TRIGGER: auto updated_at ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_cofre_baixa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cofre_baixa_updated_at ON alissonerp.cofre_ouro_baixas;
CREATE TRIGGER trg_cofre_baixa_updated_at
  BEFORE UPDATE ON alissonerp.cofre_ouro_baixas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_cofre_baixa_updated_at();

-- ═══ 5. TRIGGER: registrar rastreio ao inserir pagamento Ouro ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_rastreio_pagamento_ouro()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.forma = 'Ouro' AND NEW.status = 'confirmado' THEN
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (pagamento_id, evento, gramas, observacao)
    VALUES
      (NEW.id, 'venda_confirmada', NEW.ouro_gramas,
       'Venda #' || (SELECT numero_venda FROM alissonerp.vendas_erp WHERE id = NEW.venda_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rastreio_pagamento_ouro ON alissonerp.pagamentos_venda;
CREATE TRIGGER trg_rastreio_pagamento_ouro
  AFTER INSERT ON alissonerp.pagamentos_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rastreio_pagamento_ouro();

-- ═══ 6. TRIGGER: registrar rastreio ao criar baixa ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_rastreio_baixa_ouro()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO alissonerp.cofre_ouro_rastreios
    (baixa_id, protocolo_id, evento, gramas, destino_nome, observacao)
  VALUES
    (NEW.id, NEW.protocolo_id,
     CASE NEW.destino
       WHEN 'alisson' THEN 'baixa_direta_alisson'
       ELSE 'baixa_iniciada'
     END,
     NEW.gramas, NEW.destino,
     CASE WHEN NEW.protocolo_id IS NOT NULL THEN 'Protocolo #' || NEW.protocolo_id::text END);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rastreio_baixa_ouro ON alissonerp.cofre_ouro_baixas;
CREATE TRIGGER trg_rastreio_baixa_ouro
  AFTER INSERT ON alissonerp.cofre_ouro_baixas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rastreio_baixa_ouro();

-- ═══ 7. TRIGGER: registrar rastreio ao concluir baixa via protocolo ═══
CREATE OR REPLACE FUNCTION alissonerp.fn_rastreio_concluir_baixa()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'concluido' AND NEW.status = 'concluido' THEN
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (baixa_id, evento, gramas, destino_nome, observacao)
    VALUES
      (NEW.id, 'recebido_confirmado', NEW.gramas,
       NEW.destino, 'Recebido por ' || COALESCE(NEW.recebedor_nome, 'sistema'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rastreio_concluir_baixa ON alissonerp.cofre_ouro_baixas;
CREATE TRIGGER trg_rastreio_concluir_baixa
  AFTER UPDATE ON alissonerp.cofre_ouro_baixas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rastreio_concluir_baixa();

-- ═══ 8. PERMISSÕES ═══
GRANT SELECT ON alissonerp.vw_cofre_ouro_disponivel TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.cofre_ouro_baixas TO authenticated;
GRANT SELECT ON alissonerp.cofre_ouro_rastreios TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.cofre_ouro_baixas_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.cofre_ouro_rastreios_id_seq TO authenticated;
