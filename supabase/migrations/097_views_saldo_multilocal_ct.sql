-- Migration 097: views saldo multi-local + ct
-- Sprint 1 v2.14.0 | 28/03/2026
--
-- Reescreve vw_saldo_estoque adicionando local_estoque_id ao GROUP BY.
-- Reescreve vw_detalhe_pote adicionando peso_pedra_ct e saldo_ct.
-- Recria vw_saldo_pote (dependente de vw_saldo_estoque — mantida idêntica).
-- Cria nova vw_saldo_por_local com breakdown por local + saldo em ct.
--
-- Estratégia: DROP dependentes → DROP base → CREATE em ordem correta.
-- CREATE OR REPLACE não funciona para vw_saldo_estoque pois muda as colunas.

-- ──────────────────────────────────────────────────────────
-- 1. DROP views dependentes (em ordem de dependência)
-- ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS alissonerp.vw_saldo_pote;
DROP VIEW IF EXISTS alissonerp.vw_detalhe_pote;
DROP VIEW IF EXISTS alissonerp.vw_saldo_estoque;

-- ──────────────────────────────────────────────────────────
-- 2. Recriar vw_saldo_estoque com local_estoque_id
-- ──────────────────────────────────────────────────────────
CREATE VIEW alissonerp.vw_saldo_estoque AS
SELECT
  me.deposito_id,
  me.insumo_id,
  me.local_estoque_id,
  COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real) AS saldo,
  COUNT(*) AS total_movimentacoes,
  MAX(me.data_hora) AS ultima_movimentacao
FROM alissonerp.movimentacoes_estoque me
GROUP BY me.deposito_id, me.insumo_id, me.local_estoque_id;

-- ──────────────────────────────────────────────────────────
-- 3. Recriar vw_detalhe_pote com peso_pedra_ct e saldo_ct
-- ──────────────────────────────────────────────────────────
CREATE VIEW alissonerp.vw_detalhe_pote AS
SELECT
  i.id             AS insumo_id,
  i.sku,
  i.nome           AS insumo_nome,
  COALESCE(i.unidade, 'g'::character varying) AS unidade,
  i.categoria_id,
  ci.nome          AS categoria_nome,
  COALESCE(se.saldo_total, 0::real) AS saldo_real,
  CASE
    WHEN i.categoria_id = 2
      AND i.peso_pedra_ct IS NOT NULL
      AND i.peso_pedra_ct > 0
    THEN ROUND(
      (COALESCE(se.saldo_total, 0::real)::numeric / i.peso_pedra_ct::numeric)
    , 4)
    ELSE NULL
  END AS saldo_ct,
  i.estoque_minimo,
  i.estoque_maximo,
  i.custo_compra,
  i.descricao,
  i.ativo,
  i.foto,
  i.fornecedor_id,
  i.peso_pedra,
  i.peso_pedra_ct,
  i.observacao,
  i.created_at,
  i.updated_at
FROM alissonerp.insumos i
JOIN alissonerp.categorias_insumo ci ON ci.id = i.categoria_id
LEFT JOIN (
  SELECT insumo_id, SUM(saldo) AS saldo_total
  FROM alissonerp.vw_saldo_estoque
  GROUP BY insumo_id
) se ON se.insumo_id = i.id
WHERE i.ativo = true
ORDER BY ci.nome, i.nome;

-- ──────────────────────────────────────────────────────────
-- 4. Recriar vw_saldo_pote (idêntica ao original — mantém compatibilidade)
-- ──────────────────────────────────────────────────────────
CREATE VIEW alissonerp.vw_saldo_pote AS
SELECT
  ci.id AS categoria_id,
  ci.nome AS categoria_nome,
  count(DISTINCT i.id) AS total_insumos,
  COALESCE(sum(se.saldo_total), 0::real) AS saldo_total,
  COALESCE((
    SELECT insumos.unidade
    FROM alissonerp.insumos
    WHERE insumos.categoria_id = ci.id AND insumos.ativo = true
    LIMIT 1
  ), 'g'::character varying) AS unidade
FROM alissonerp.categorias_insumo ci
LEFT JOIN alissonerp.insumos i
  ON i.categoria_id = ci.id AND i.ativo = true
LEFT JOIN (
  SELECT vw_saldo_estoque.insumo_id,
    sum(vw_saldo_estoque.saldo) AS saldo_total
  FROM alissonerp.vw_saldo_estoque
  WHERE vw_saldo_estoque.deposito_id = 1
  GROUP BY vw_saldo_estoque.insumo_id
) se ON se.insumo_id = i.id
GROUP BY ci.id, ci.nome
ORDER BY ci.id;

-- ──────────────────────────────────────────────────────────
-- 5. NOVA VIEW: vw_saldo_por_local
-- ──────────────────────────────────────────────────────────
CREATE VIEW alissonerp.vw_saldo_por_local AS
SELECT
  le.id                         AS local_estoque_id,
  le.nome                       AS local_nome,
  me.insumo_id,
  i.nome                        AS insumo_nome,
  i.sku,
  i.categoria_id,
  ci.nome                       AS categoria_nome,
  COALESCE(i.unidade, 'g')      AS unidade,
  i.peso_pedra_ct,
  COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real) AS saldo,
  CASE
    WHEN i.categoria_id = 2
      AND i.peso_pedra_ct IS NOT NULL
      AND i.peso_pedra_ct > 0
    THEN ROUND(
      ((COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real))::numeric
        / i.peso_pedra_ct::numeric)
    , 4)
    ELSE NULL
  END AS saldo_ct
FROM alissonerp.locais_estoque le
LEFT JOIN alissonerp.movimentacoes_estoque me ON me.local_estoque_id = le.id
LEFT JOIN alissonerp.insumos               i  ON i.id = me.insumo_id
LEFT JOIN alissonerp.categorias_insumo     ci ON ci.id = i.categoria_id
WHERE le.ativo = true
GROUP BY le.id, le.nome, me.insumo_id, i.nome, i.sku,
         i.categoria_id, ci.nome, i.unidade, i.peso_pedra_ct;

-- ──────────────────────────────────────────────────────────
-- 6. GRANTS
-- ──────────────────────────────────────────────────────────
GRANT SELECT ON alissonerp.vw_saldo_estoque TO authenticated, anon;
GRANT SELECT ON alissonerp.vw_detalhe_pote  TO authenticated, anon;
GRANT SELECT ON alissonerp.vw_saldo_pote    TO authenticated, anon;
GRANT SELECT ON alissonerp.vw_saldo_por_local TO authenticated, anon;
