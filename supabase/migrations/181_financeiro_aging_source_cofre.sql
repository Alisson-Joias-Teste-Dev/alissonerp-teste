-- Migration 181: Aging de contas, source em pagamentos, cofre de ouro
-- Criada em: 2026-04-25
-- Contexto: módulo financeiro — maturidade, rastreabilidade de origem e posição em ouro

SET search_path TO alissonerp, public;

-- ─── 1. Coluna source em pagamentos_venda ─────────────────────────────────────
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS source VARCHAR(20)
  CHECK (source IN ('webhook_mp','manual_mp','pdv','manual','ouro','dinheiro','vale_troca','a_receber'));

-- Backfill lógico (só registros sem source)
UPDATE alissonerp.pagamentos_venda SET source =
  CASE
    WHEN gateway_payload::text LIKE '%webhook%' OR gateway_id IS NOT NULL THEN 'webhook_mp'
    WHEN forma = 'Ouro'        THEN 'ouro'
    WHEN forma = 'Dinheiro'    THEN 'dinheiro'
    WHEN forma = 'Vale-Troca'  THEN 'vale_troca'
    WHEN forma = 'A Receber'   THEN 'a_receber'
    WHEN forma LIKE '%Mercado Pago%' AND gateway_id IS NULL THEN 'manual_mp'
    ELSE 'manual'
  END
WHERE source IS NULL;

-- ─── 2. UNIQUE constraint em gateway_id (idempotente) ─────────────────────────
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
END$$;

-- ─── 3. FK pagamento_venda_id em fin_conciliacoes ─────────────────────────────
ALTER TABLE alissonerp.fin_conciliacoes
  ADD COLUMN IF NOT EXISTS pagamento_venda_id INTEGER
    REFERENCES alissonerp.pagamentos_venda(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_conciliacoes_pagamento_venda_id
  ON alissonerp.fin_conciliacoes(pagamento_venda_id);

-- ─── 4. View: aging de contas a pagar e a receber ─────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_aging_contas AS
SELECT
  'pagar'::text                   AS tipo,
  cp.id,
  cp.descricao,
  cp.fornecedor_id                AS contato_id,
  cp.fornecedor_nome              AS contato_nome,
  cp.valor,
  cp.data_vencimento,
  cp.data_pagamento               AS data_liquidacao,
  cp.situacao,
  cp.categoria,
  cp.obs,
  cp.created_at,
  CASE
    WHEN cp.situacao IN ('pago', 'cancelado') THEN cp.situacao
    WHEN cp.data_vencimento IS NULL            THEN 'sem_vencimento'
    WHEN cp.data_vencimento < CURRENT_DATE     THEN 'atrasado'
    WHEN cp.data_vencimento = CURRENT_DATE     THEN 'vence_hoje'
    ELSE 'a_vencer'
  END AS maturidade,
  CASE
    WHEN cp.situacao = 'pendente' AND cp.data_vencimento IS NOT NULL AND cp.data_vencimento < CURRENT_DATE
    THEN (CURRENT_DATE - cp.data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM alissonerp.contas_pagar cp

UNION ALL

SELECT
  'receber'::text                 AS tipo,
  cr.id,
  cr.descricao,
  cr.cliente_id                   AS contato_id,
  cr.cliente_nome                 AS contato_nome,
  cr.valor,
  cr.data_vencimento,
  cr.data_recebimento             AS data_liquidacao,
  cr.situacao,
  cr.categoria,
  cr.obs,
  cr.created_at,
  CASE
    WHEN cr.situacao IN ('recebido', 'cancelado') THEN cr.situacao
    WHEN cr.data_vencimento IS NULL               THEN 'sem_vencimento'
    WHEN cr.data_vencimento < CURRENT_DATE        THEN 'atrasado'
    WHEN cr.data_vencimento = CURRENT_DATE        THEN 'vence_hoje'
    ELSE 'a_vencer'
  END AS maturidade,
  CASE
    WHEN cr.situacao = 'pendente' AND cr.data_vencimento IS NOT NULL AND cr.data_vencimento < CURRENT_DATE
    THEN (CURRENT_DATE - cr.data_vencimento)
    ELSE 0
  END AS dias_atraso
FROM alissonerp.contas_receber cr;

-- ─── 5. View: cofre de ouro ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro AS
SELECT
  COUNT(*)::integer                                                 AS total_transacoes,
  COALESCE(SUM(pv.ouro_gramas), 0)                                  AS total_gramas,
  COALESCE(SUM(pv.valor), 0)                                        AS total_valor_brl,
  COALESCE(AVG(pv.ouro_valor_grama), 0)                             AS preco_medio_grama,
  COUNT(*) FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days')::integer AS transacoes_30d,
  COALESCE(SUM(pv.ouro_gramas)
    FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS gramas_30d,
  COALESCE(SUM(pv.valor)
    FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS valor_brl_30d
FROM alissonerp.pagamentos_venda pv
WHERE pv.forma = 'Ouro'
  AND pv.status = 'confirmado';
