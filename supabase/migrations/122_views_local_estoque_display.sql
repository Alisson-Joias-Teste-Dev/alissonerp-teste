-- ============================================================
-- 122 — Adicionar local_estoque_nome nas views de movimentações e saldos
-- ============================================================

-- 1. vw_movimentacoes_directus — adicionar local_estoque
DROP VIEW IF EXISTS alissonerp.vw_movimentacoes_directus;
CREATE VIEW alissonerp.vw_movimentacoes_directus AS
SELECT
  m.id,
  m.entrada,
  m.saida,
  m.insumo_id,
  ins.nome                                    AS insumo_nome,
  m.deposito_id,
  dep.nome                                    AS deposito_nome,
  m.setor_id                                  AS setor,
  st.nome                                     AS setor_nome,
  m.marcador::text                            AS marcador,
  m.ordem_id,
  o.numero_ordem,
  m.obs,
  m.data_hora,
  m.created_at                                AS date_created,
  m.local_estoque_id,
  le.nome                                     AS local_estoque_nome
FROM alissonerp.movimentacoes_estoque m
LEFT JOIN alissonerp.insumos           ins ON ins.id = m.insumo_id
LEFT JOIN alissonerp.depositos         dep ON dep.id = m.deposito_id
LEFT JOIN alissonerp.setores           st  ON st.id  = m.setor_id
LEFT JOIN alissonerp.ordens            o   ON o.id   = m.ordem_id
LEFT JOIN alissonerp.locais_estoque    le  ON le.id  = m.local_estoque_id;


-- 2. vw_estoque_directus_saldo — agrupar POR local_estoque_id para separar saldos
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
  m.local_estoque_id,
  le.nome                                     AS local_estoque_nome,
  COALESCE(SUM(m.entrada), 0::real)           AS total_entrada,
  COALESCE(SUM(m.saida),   0::real)           AS total_saida,
  COALESCE(SUM(m.entrada), 0::real) - COALESCE(SUM(m.saida), 0::real) AS saldo,
  CASE
    WHEN cat.id = 2
    THEN ROUND(((COALESCE(SUM(m.entrada), 0::real) - COALESCE(SUM(m.saida), 0::real)) / 0.2)::numeric, 4)
    ELSE NULL::numeric
  END                                         AS saldo_ct,
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
LEFT JOIN alissonerp.locais_estoque     le  ON le.id   = m.local_estoque_id
GROUP BY m.deposito_id, dep.nome, m.insumo_id, ins.nome, ins.sku,
         cat.nome, cat.id, ins.peso_pedra, ins.peso_pedra_ct,
         m.local_estoque_id, le.nome;
