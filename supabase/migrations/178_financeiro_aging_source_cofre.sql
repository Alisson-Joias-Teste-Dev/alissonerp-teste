-- v2.31.14 — Financeiro: aging, source, cofre ouro, unique gateway_id
-- Items: aging view, coluna source em pagamentos_venda, UNIQUE gateway_id,
--        view vw_cofre_ouro, pagamento_venda_id em fin_conciliacoes

SET search_path TO alissonerp;

-- ─── 1. Coluna source em pagamentos_venda ────────────────────────────────────
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS source VARCHAR(20)
  CHECK (source IN (
    'webhook_mp','manual_mp','pdv','manual',
    'ouro','dinheiro','vale_troca','a_receber'
  ));

-- Backfill lógico baseado em forma + gateway existentes
UPDATE alissonerp.pagamentos_venda SET source =
  CASE
    WHEN gateway_id IS NOT NULL THEN 'webhook_mp'
    WHEN forma = 'Ouro'           THEN 'ouro'
    WHEN forma = 'Dinheiro'       THEN 'dinheiro'
    WHEN forma = 'Vale-Troca'     THEN 'vale_troca'
    WHEN forma = 'A Receber'      THEN 'a_receber'
    WHEN forma ILIKE '%mercado pago%' AND gateway_id IS NULL THEN 'manual_mp'
    ELSE 'manual'
  END
WHERE source IS NULL;

-- ─── 2. UNIQUE constraint em gateway_id (se não existir) ────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'alissonerp'
      AND table_name   = 'pagamentos_venda'
      AND constraint_name = 'uq_pagamentos_gateway_id'
  ) THEN
    ALTER TABLE alissonerp.pagamentos_venda
      ADD CONSTRAINT uq_pagamentos_gateway_id
      UNIQUE (gateway_id);
  END IF;
END $$;

-- Índice parcial para performance (exclui NULLs e strings vazias)
CREATE INDEX IF NOT EXISTS idx_pagamentos_gateway_id_nn
  ON alissonerp.pagamentos_venda (gateway_id)
  WHERE gateway_id IS NOT NULL AND gateway_id != '';

-- ─── 3. View: Aging de Contas ─────────────────────────────────────────────────
-- Status de maturidade calculado: atrasado / vence_hoje / a_vencer / pago / cancelado
CREATE OR REPLACE VIEW alissonerp.vw_aging_contas AS
SELECT
  'pagar'::text AS tipo,
  id,
  descricao,
  fornecedor_id  AS contato_id,
  fornecedor_nome AS contato_nome,
  valor,
  data_vencimento,
  data_pagamento  AS data_liquidacao,
  situacao,
  categoria,
  obs,
  created_at,
  CASE
    WHEN situacao IN ('pago', 'cancelado', 'recebido') THEN situacao
    WHEN data_vencimento IS NULL                        THEN 'sem_vencimento'
    WHEN data_vencimento < CURRENT_DATE                 THEN 'atrasado'
    WHEN data_vencimento = CURRENT_DATE                 THEN 'vence_hoje'
    ELSE                                                     'a_vencer'
  END AS maturidade,
  CASE
    WHEN situacao = 'pendente' AND data_vencimento < CURRENT_DATE
    THEN (CURRENT_DATE - data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM alissonerp.contas_pagar

UNION ALL

SELECT
  'receber'::text AS tipo,
  id,
  descricao,
  cliente_id     AS contato_id,
  cliente_nome   AS contato_nome,
  valor,
  data_vencimento,
  data_recebimento AS data_liquidacao,
  situacao,
  categoria,
  obs,
  created_at,
  CASE
    WHEN situacao IN ('pago', 'recebido', 'cancelado') THEN situacao
    WHEN data_vencimento IS NULL                        THEN 'sem_vencimento'
    WHEN data_vencimento < CURRENT_DATE                 THEN 'atrasado'
    WHEN data_vencimento = CURRENT_DATE                 THEN 'vence_hoje'
    ELSE                                                     'a_vencer'
  END AS maturidade,
  CASE
    WHEN situacao = 'pendente' AND data_vencimento < CURRENT_DATE
    THEN (CURRENT_DATE - data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM alissonerp.contas_receber;

-- ─── 4. View: Cofre de Ouro ──────────────────────────────────────────────────
-- Posição agregada de pagamentos recebidos em ouro (confirmados)
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro AS
SELECT
  COUNT(*)::integer                                            AS total_transacoes,
  COALESCE(SUM(COALESCE(ouro_peso, ouro_gramas)), 0)          AS total_gramas,
  COALESCE(SUM(valor), 0)                                     AS total_valor_brl,
  COALESCE(AVG(ouro_valor_grama) FILTER (WHERE ouro_valor_grama > 0), 0) AS preco_medio_grama,
  -- Últimos 30 dias
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::integer AS transacoes_30d,
  COALESCE(SUM(COALESCE(ouro_peso, ouro_gramas)) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS gramas_30d,
  COALESCE(SUM(valor) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS valor_brl_30d
FROM alissonerp.pagamentos_venda
WHERE forma = 'Ouro' AND status = 'confirmado';

-- ─── 5. FK pagamento_venda_id em fin_conciliacoes ───────────────────────────
-- Necessário para rastrear qual pagamento foi confirmado na aba de conciliação pendente
ALTER TABLE alissonerp.fin_conciliacoes
  ADD COLUMN IF NOT EXISTS pagamento_venda_id INTEGER
  REFERENCES alissonerp.pagamentos_venda(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_conciliacoes_pagamento
  ON alissonerp.fin_conciliacoes (pagamento_venda_id)
  WHERE pagamento_venda_id IS NOT NULL;
