-- Migration 204: Fix vw_cofre_ouro to use COALESCE(ouro_peso, ouro_gramas)
-- Criada em: 2026-05-05
-- Contexto: Migration 181 quebrou o fallback ouro_peso -> ouro_gramas que existia na 178.
--            Dados historicos estao em ouro_peso, nao em ouro_gramas.
SET search_path TO alissonerp, public;

-- ─── 1. Fix vw_cofre_ouro ──────────────────────────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro AS
SELECT
  COUNT(*)::integer                                                 AS total_transacoes,
  COALESCE(SUM(COALESCE(pv.ouro_peso, pv.ouro_gramas)), 0)          AS total_gramas,
  COALESCE(SUM(pv.valor), 0)                                        AS total_valor_brl,
  COALESCE(AVG(pv.ouro_valor_grama)
    FILTER (WHERE pv.ouro_valor_grama > 0), 0)                      AS preco_medio_grama,
  COUNT(*) FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days')::integer AS transacoes_30d,
  COALESCE(SUM(COALESCE(pv.ouro_peso, pv.ouro_gramas))
    FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS gramas_30d,
  COALESCE(SUM(pv.valor)
    FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS valor_brl_30d
FROM alissonerp.pagamentos_venda pv
WHERE pv.forma = 'Ouro' AND pv.status = 'confirmado';

-- ─── 2. Fix vw_cofre_ouro_disponivel ───────────────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro_disponivel AS
WITH c AS (
  SELECT
    COUNT(*)::integer                                             AS total_transacoes,
    COALESCE(SUM(COALESCE(pv.ouro_peso, pv.ouro_gramas)), 0)      AS total_gramas,
    COALESCE(SUM(pv.valor), 0)                                    AS total_valor_brl,
    COALESCE(AVG(pv.ouro_valor_grama)
      FILTER (WHERE pv.ouro_valor_grama > 0), 0)                  AS preco_medio_grama,
    COUNT(*) FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days')::integer  AS transacoes_30d,
    COALESCE(SUM(pv.valor)
      FILTER (WHERE pv.created_at >= NOW() - INTERVAL '30 days'), 0) AS valor_brl_30d
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
