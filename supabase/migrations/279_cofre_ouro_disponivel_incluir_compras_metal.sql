-- Migration 279: incluir compras/recebimentos de metal no saldo do cofre
-- REGRA DE NEGÓCIO:
--   - Após confirmação da compra de metal, o peso deve compor o saldo disponível do cofre.
--   - Recebimentos de metal ativos também compõem o saldo.
--   - Baixas do cofre continuam abatendo o saldo disponível.
-- IMPACTO SE REMOVIDO:
--   - O Financeiro > Caixa > Ouro não reflete compras/recebimentos confirmados,
--     exibindo saldo menor que o real.

SET search_path TO alissonerp, public;

CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro_disponivel AS
WITH vendas_ouro AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(COALESCE(pv.ouro_peso, pv.ouro_gramas)), 0)::numeric AS gramas,
    COALESCE(SUM(pv.valor), 0)::numeric AS valor_brl,
    COALESCE(AVG(pv.ouro_valor_grama) FILTER (WHERE pv.ouro_valor_grama > 0), 0)::numeric AS preco_medio_grama
  FROM alissonerp.pagamentos_venda pv
  WHERE pv.forma = 'Ouro' AND pv.status = 'confirmado'
), compras_metal AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(cm.peso_gramas), 0)::numeric AS gramas,
    COALESCE(SUM(cm.valor_total), 0)::numeric AS valor_brl
  FROM alissonerp.compras_metal cm
  WHERE cm.status = 'confirmado' AND cm.cofre_registrado = true
), recebimentos_metal AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(rm.peso_gramas), 0)::numeric AS gramas,
    COALESCE(SUM(rm.valor_total), 0)::numeric AS valor_brl
  FROM alissonerp.recebimentos_metal rm
  WHERE rm.status = 'ativo' AND rm.cofre_registrado = true
), total_entradas AS (
  SELECT
    (v.transacoes + c.transacoes + r.transacoes)::integer AS total_transacoes,
    (v.gramas + c.gramas + r.gramas)::numeric AS total_gramas,
    (v.valor_brl + c.valor_brl + r.valor_brl)::numeric AS total_valor_brl,
    v.preco_medio_grama::numeric AS preco_medio_grama
  FROM vendas_ouro v
  CROSS JOIN compras_metal c
  CROSS JOIN recebimentos_metal r
), baixas AS (
  SELECT COALESCE(SUM(cb.gramas), 0)::numeric AS baixado_gramas
  FROM alissonerp.cofre_ouro_baixas cb
  WHERE cb.status IN ('pendente', 'em_trafego', 'concluido')
)
SELECT
  e.total_transacoes,
  e.total_gramas,
  (e.total_gramas - b.baixado_gramas)::numeric AS disponivel_gramas,
  e.total_valor_brl,
  e.preco_medio_grama
FROM total_entradas e
CROSS JOIN baixas b;
