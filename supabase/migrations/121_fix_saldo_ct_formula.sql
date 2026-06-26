-- ============================================================
-- 121 — Corrigir fórmula saldo_ct (era gramas/ct_unitario, agora gramas/0.2)
--       + adicionar quantidade (pedras) nas views
--       + adicionar saldo_ct na vw_estoque_directus_saldo
-- ============================================================

-- 1. vw_detalhe_pote — DROP+CREATE (nova coluna quantidade no meio)
DROP VIEW IF EXISTS alissonerp.vw_detalhe_pote;
CREATE VIEW alissonerp.vw_detalhe_pote AS
SELECT
  i.id                                        AS insumo_id,
  i.sku,
  i.nome                                      AS insumo_nome,
  COALESCE(i.unidade, 'g'::varchar)           AS unidade,
  i.categoria_id,
  ci.nome                                     AS categoria_nome,
  COALESCE(se.saldo_total, 0::real)           AS saldo_real,
  -- saldo em quilates: gramas / 0.2  (FIX: antes dividia por ct_unitario)
  CASE
    WHEN i.categoria_id = 2
    THEN ROUND((COALESCE(se.saldo_total, 0::real) / 0.2)::numeric, 4)
    ELSE NULL::numeric
  END                                         AS saldo_ct,
  -- quantidade de pedras: gramas / peso_pedra (g por unidade)
  CASE
    WHEN i.categoria_id = 2
      AND i.peso_pedra IS NOT NULL
      AND i.peso_pedra > 0
    THEN ROUND((COALESCE(se.saldo_total, 0::real) / i.peso_pedra)::numeric, 0)
    ELSE NULL::numeric
  END                                         AS quantidade,
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
  FROM   alissonerp.vw_saldo_estoque
  GROUP BY insumo_id
) se ON se.insumo_id = i.id
WHERE i.ativo = true
ORDER BY ci.nome, i.nome;


-- 2. vw_saldo_por_local — DROP+CREATE (nova coluna quantidade)
DROP VIEW IF EXISTS alissonerp.vw_saldo_por_local;
CREATE VIEW alissonerp.vw_saldo_por_local AS
SELECT
  le.id                                       AS local_estoque_id,
  le.nome                                     AS local_nome,
  me.insumo_id,
  i.nome                                      AS insumo_nome,
  i.sku,
  i.categoria_id,
  ci.nome                                     AS categoria_nome,
  COALESCE(i.unidade, 'g')                    AS unidade,
  i.peso_pedra,
  i.peso_pedra_ct,
  COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real) AS saldo,
  -- saldo em quilates: gramas / 0.2
  CASE
    WHEN i.categoria_id = 2
    THEN ROUND(((COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real)) / 0.2)::numeric, 4)
    ELSE NULL::numeric
  END                                         AS saldo_ct,
  -- quantidade de pedras
  CASE
    WHEN i.categoria_id = 2
      AND i.peso_pedra IS NOT NULL
      AND i.peso_pedra > 0
    THEN ROUND(((COALESCE(SUM(me.entrada), 0::real) - COALESCE(SUM(me.saida), 0::real)) / i.peso_pedra)::numeric, 0)
    ELSE NULL::numeric
  END                                         AS quantidade
FROM alissonerp.locais_estoque le
LEFT JOIN alissonerp.movimentacoes_estoque me ON me.local_estoque_id = le.id
LEFT JOIN alissonerp.insumos              i   ON i.id = me.insumo_id
LEFT JOIN alissonerp.categorias_insumo    ci  ON ci.id = i.categoria_id
WHERE le.ativo = true
GROUP BY le.id, le.nome, me.insumo_id, i.nome, i.sku,
         i.categoria_id, ci.nome, i.unidade, i.peso_pedra, i.peso_pedra_ct;


-- 3. vw_estoque_directus_saldo — DROP+CREATE (novas colunas saldo_ct, quantidade)
DROP VIEW IF EXISTS alissonerp.vw_estoque_directus_saldo;
CREATE VIEW alissonerp.vw_estoque_directus_saldo AS
SELECT
  m.deposito_id,
  dep.nome                                    AS deposito_nome,
  m.insumo_id,
  ins.nome                                    AS insumo_nome,
  ins.sku                                     AS insumo_sku,
  cat.nome                                    AS categoria_nome,
  cat.id                                      AS categoria_id,
  COALESCE(SUM(m.entrada), 0::real)           AS total_entrada,
  COALESCE(SUM(m.saida),   0::real)           AS total_saida,
  COALESCE(SUM(m.entrada), 0::real) - COALESCE(SUM(m.saida), 0::real) AS saldo,
  -- saldo em quilates: gramas / 0.2
  CASE
    WHEN cat.id = 2
    THEN ROUND(((COALESCE(SUM(m.entrada), 0::real) - COALESCE(SUM(m.saida), 0::real)) / 0.2)::numeric, 4)
    ELSE NULL::numeric
  END                                         AS saldo_ct,
  -- quantidade de pedras
  CASE
    WHEN cat.id = 2
      AND ins.peso_pedra IS NOT NULL
      AND ins.peso_pedra > 0
    THEN ROUND(((COALESCE(SUM(m.entrada), 0::real) - COALESCE(SUM(m.saida), 0::real)) / ins.peso_pedra)::numeric, 0)
    ELSE NULL::numeric
  END                                         AS quantidade,
  ins.peso_pedra,
  ins.peso_pedra_ct,
  COUNT(*)                                    AS total_movimentacoes,
  MAX(m.created_at)                           AS ultima_movimentacao
FROM alissonerp.movimentacoes_estoque m
LEFT JOIN alissonerp.depositos          dep ON dep.id  = m.deposito_id
LEFT JOIN alissonerp.insumos            ins ON ins.id  = m.insumo_id
LEFT JOIN alissonerp.categorias_insumo  cat ON cat.id  = ins.categoria_id
GROUP BY m.deposito_id, dep.nome, m.insumo_id, ins.nome, ins.sku,
         cat.nome, cat.id, ins.peso_pedra, ins.peso_pedra_ct;
