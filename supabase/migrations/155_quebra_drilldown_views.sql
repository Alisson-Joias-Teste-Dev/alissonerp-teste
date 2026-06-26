-- ============================================================================
-- 092 — Views para drill-down de quebra: Fábrica → Setor → Operador
--
-- Permite navegação hierárquica na tela de Quebra de Ouro.
-- Percentual sempre sobre PMC (ouro que saiu na peça), não total_metal.
--
-- NOTA: setor vem de distribuicoes.setor_id (via distribuicao_ordens),
-- pois ordens.setor_atual é zerado quando a ordem é concluída (saída PCP).
-- ============================================================================

-- ═══ 1. VIEW QUEBRA POR SETOR ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_por_setor;

CREATE VIEW alissonerp.vw_quebra_por_setor AS
SELECT
  s.id   AS setor_id,
  s.nome AS setor_nome,
  COUNT(DISTINCT p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0)   AS total_metal,
  COALESCE(SUM(p.pmc), 0)           AS total_pmc,
  COALESCE(SUM(p.retorno_metal), 0) AS total_retorno,
  COALESCE(SUM(p.quebra), 0)        AS total_quebra,
  CASE
    WHEN SUM(p.pmc) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.pmc), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_quebra
FROM alissonerp.pcp p
JOIN alissonerp.distribuicao_ordens doo ON doo.ordens_id = p.ordem_id
JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
JOIN alissonerp.setores s ON s.id = d.setor_id
WHERE p.etapas = 'concluido'
  AND p.total_metal > 0
GROUP BY s.id, s.nome
ORDER BY total_quebra DESC;

COMMENT ON VIEW alissonerp.vw_quebra_por_setor IS 'Quebra de ouro agregada por setor (via distribuicao). Percentual sobre PMC. LEITURA.';

-- ═══ 2. VIEW QUEBRA POR SETOR + OPERADOR ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_setor_operador;

CREATE VIEW alissonerp.vw_quebra_setor_operador AS
SELECT
  s.id   AS setor_id,
  s.nome AS setor_nome,
  p.operador AS operador_id,
  COALESCE(u.nome, 'Sem operador') AS operador_nome,
  COUNT(DISTINCT p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0)   AS total_metal,
  COALESCE(SUM(p.pmc), 0)           AS total_pmc,
  COALESCE(SUM(p.retorno_metal), 0) AS total_retorno,
  COALESCE(SUM(p.quebra), 0)        AS total_quebra,
  CASE
    WHEN SUM(p.pmc) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.pmc), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_medio
FROM alissonerp.pcp p
JOIN alissonerp.distribuicao_ordens doo ON doo.ordens_id = p.ordem_id
JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
JOIN alissonerp.setores s ON s.id = d.setor_id
LEFT JOIN alissonerp.usuarios u ON p.operador = u.id
WHERE p.etapas = 'concluido'
  AND p.total_metal > 0
GROUP BY s.id, s.nome, p.operador, u.nome
ORDER BY total_quebra DESC;

COMMENT ON VIEW alissonerp.vw_quebra_setor_operador IS 'Quebra por operador dentro de cada setor (via distribuicao). Percentual sobre PMC. LEITURA.';

-- ═══ 3. GRANTS ═══
GRANT SELECT ON alissonerp.vw_quebra_por_setor      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_quebra_setor_operador  TO anon, authenticated;
