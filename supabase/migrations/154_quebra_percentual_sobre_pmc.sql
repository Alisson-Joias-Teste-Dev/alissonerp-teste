-- ============================================================================
-- 091 — Corrigir base de cálculo do percentual de quebra
--
-- ANTES:  percentual = quebra / total_metal  (base = todo metal processado)
-- DEPOIS: percentual = quebra / pmc          (base = ouro que saiu na peça)
--
-- Exemplo: 300g estoque → 190g saiu nas peças → 50g sobra → 60g quebra
--   Antes:  60/300 = 20%
--   Depois: 60/190 = 31,58%
-- ============================================================================

-- ═══ 1. VIEW QUEBRA POR OURIVES ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_por_ourives;

CREATE VIEW alissonerp.vw_quebra_por_ourives AS
SELECT
  p.operador AS operador_id,
  COALESCE(u.nome, 'Sem operador') AS operador_nome,
  COUNT(p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0) AS total_metal,
  COALESCE(SUM(p.retorno_metal), 0) AS total_retorno,
  COALESCE(SUM(p.pmc), 0) AS total_pmc,
  COALESCE(SUM(p.quebra), 0) AS total_quebra,
  CASE
    WHEN SUM(p.pmc) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.pmc), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_medio
FROM alissonerp.pcp p
LEFT JOIN alissonerp.usuarios u ON p.operador = u.id
WHERE p.etapas = 'concluido'
  AND p.total_metal > 0
GROUP BY p.operador, u.nome
ORDER BY percentual_medio DESC;

COMMENT ON VIEW alissonerp.vw_quebra_por_ourives IS 'Quebra de ouro por ourives (PCP concluidos). Percentual sobre PMC (saída peças). LEITURA.';

-- ═══ 2. VIEW QUEBRA MENSAL ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_mensal;

CREATE VIEW alissonerp.vw_quebra_mensal AS
SELECT
  DATE_TRUNC('month', p.data_conclusao) AS mes,
  TO_CHAR(p.data_conclusao, 'Mon/YY') AS mes_label,
  COUNT(p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0) AS total_metal,
  COALESCE(SUM(p.pmc), 0) AS total_pmc,
  COALESCE(SUM(p.quebra), 0) AS total_quebra,
  CASE
    WHEN SUM(p.pmc) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.pmc), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_quebra
FROM alissonerp.pcp p
WHERE p.etapas = 'concluido'
  AND p.data_conclusao IS NOT NULL
  AND p.total_metal > 0
GROUP BY DATE_TRUNC('month', p.data_conclusao), TO_CHAR(p.data_conclusao, 'Mon/YY')
ORDER BY mes DESC
LIMIT 12;

COMMENT ON VIEW alissonerp.vw_quebra_mensal IS 'Tendencia mensal de quebra de ouro. Percentual sobre PMC (saída peças). LEITURA.';

-- ═══ 3. GRANTS ═══
GRANT SELECT ON alissonerp.vw_quebra_por_ourives TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_quebra_mensal      TO anon, authenticated;
