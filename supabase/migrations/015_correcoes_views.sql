
SET search_path TO alissonerp;

-- ═══ 1. RECRIAR vw_ordens_completa COM ACENTOS ═══
DROP VIEW IF EXISTS alissonerp.vw_ordens_completa;

CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT
  o.id,
  o.numero_ordem,

  o.situacao AS situacao_cod,
  CASE o.situacao
    WHEN '1' THEN 'Cancelado'
    WHEN '2' THEN 'Criado'
    WHEN '3' THEN 'Rascunho'
    ELSE 'Desconhecido'
  END AS situacao,

  o.status AS status_cod,
  CASE o.status
    WHEN '1' THEN 'Aguardando'
    WHEN '2' THEN 'Em Andamento'
    WHEN '3' THEN 'Concluído'
    ELSE 'Aguardando'
  END AS status,

  o.rota AS rota_cod,
  CASE o.rota
    WHEN '1' THEN 'PCP'
    WHEN '2' THEN 'Protocolo'
    ELSE '—'
  END AS rota,

  o.tipo_ordem AS tipo_ordem_cod,
  CASE o.tipo_ordem
    WHEN '1' THEN 'Produção'
    WHEN '2' THEN 'Reparo'
    WHEN '3' THEN 'Ajuste'
    WHEN '4' THEN 'Banho'
    WHEN '5' THEN 'Gravação'
    WHEN '6' THEN 'Reposição'
    WHEN '7' THEN 'Outro'
    ELSE '—'
  END AS tipo_ordem,

  o.setor_atual AS setor_id,
  s.descricao AS setor_nome,
  o.local_atual AS deposito_id,
  d.nome AS deposito_nome,
  o.vendedor_id,
  v.nome AS vendedor_nome,
  o.cliente_id,
  c.nome AS cliente_nome,

  o.peso_metal_negocido AS peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.date_created,
  o.date_updated

FROM directus.ordens o
LEFT JOIN directus.setor s ON o.setor_atual = s.id
LEFT JOIN directus.deposito d ON o.local_atual = d.id
LEFT JOIN public.vendedores v ON o.vendedor_id = v.id_vendedor
LEFT JOIN public.contatos c ON o.cliente_id = c.id_contato;

-- ═══ 2. VIEW DO ESTOQUE DO DIRECTUS ═══
DROP VIEW IF EXISTS alissonerp.vw_estoque_directus_saldo;

CREATE VIEW alissonerp.vw_estoque_directus_saldo AS
SELECT
  ce.deposito_id,
  dep.nome AS deposito_nome,
  ce.insumo_id,
  ins.nome AS insumo_nome,
  ins.sku AS insumo_sku,
  cat.nome AS categoria_nome,
  cat.id AS categoria_id,
  COALESCE(SUM(ce.entrada), 0) AS total_entrada,
  COALESCE(SUM(ce.saida), 0) AS total_saida,
  COALESCE(SUM(ce.entrada), 0) - COALESCE(SUM(ce.saida), 0) AS saldo,
  COUNT(*) AS total_movimentacoes,
  MAX(ce.date_created) AS ultima_movimentacao
FROM directus.controle_estoque ce
LEFT JOIN directus.deposito dep ON ce.deposito_id = dep.id
LEFT JOIN directus.insumos ins ON ce.insumo_id = ins.id
LEFT JOIN directus.categoria_insumo cat ON ins.categoria_id = cat.id
GROUP BY ce.deposito_id, dep.nome, ce.insumo_id, ins.nome, ins.sku, cat.nome, cat.id;

-- ═══ 3. VIEW MOVIMENTACOES RECENTES DO DIRECTUS ═══
DROP VIEW IF EXISTS alissonerp.vw_movimentacoes_directus;

CREATE VIEW alissonerp.vw_movimentacoes_directus AS
SELECT
  ce.id,
  ce.entrada,
  ce.saida,
  ce.insumo_id,
  ins.nome AS insumo_nome,
  ce.deposito_id,
  dep.nome AS deposito_nome,
  ce.setor,
  s.descricao AS setor_nome,
  ce.marcador,
  ce.ordem_id,
  o.numero_ordem,
  ce.obs,
  ce.data_hora,
  ce.date_created
FROM directus.controle_estoque ce
LEFT JOIN directus.insumos ins ON ce.insumo_id = ins.id
LEFT JOIN directus.deposito dep ON ce.deposito_id = dep.id
LEFT JOIN directus.setor s ON ce.setor = s.id
LEFT JOIN directus.ordens o ON ce.ordem_id = o.id;

-- ═══ 4. VIEW INSUMOS DO DIRECTUS ═══
DROP VIEW IF EXISTS alissonerp.vw_insumos_directus;

CREATE VIEW alissonerp.vw_insumos_directus AS
SELECT
  i.id,
  i.sku,
  i.nome,
  cat.nome AS categoria,
  cat.id AS categoria_id,
  i.saldo,
  i.peso_pedra,
  i.custo_compra,
  i.estoque_minimo,
  i.estoque_maximo,
  CASE
    WHEN i.saldo <= 0 THEN 'critico'
    WHEN i.estoque_minimo > 0 AND i.saldo < i.estoque_minimo THEN 'critico'
    WHEN i.estoque_minimo > 0 AND i.saldo < (i.estoque_minimo * 1.5) THEN 'atencao'
    ELSE 'ok'
  END AS status_estoque
FROM directus.insumos i
LEFT JOIN directus.categoria_insumo cat ON i.categoria_id = cat.id;

-- ═══ 5. VIEW QUEBRA POR OURIVES ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_por_ourives;

CREATE VIEW alissonerp.vw_quebra_por_ourives AS
SELECT
  p.operador AS operador_id,
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email,
    'Sem operador'
  ) AS operador_nome,
  COUNT(p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0) AS total_metal,
  COALESCE(SUM(p.retorno_metal), 0) AS total_retorno,
  COALESCE(SUM(p.pmc), 0) AS total_pmc,
  COALESCE(SUM(p.quebra), 0) AS total_quebra,
  CASE
    WHEN SUM(p.total_metal) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.total_metal), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_medio
FROM directus.pcp p
LEFT JOIN directus.directus_users du ON p.operador::uuid = du.id
WHERE p.etapas = '5'
  AND p.total_metal > 0
GROUP BY p.operador, du.first_name, du.last_name, du.email
ORDER BY percentual_medio DESC;

-- ═══ 6. VIEW QUEBRA MENSAL ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_mensal;

CREATE VIEW alissonerp.vw_quebra_mensal AS
SELECT
  DATE_TRUNC('month', p.data_conclusao) AS mes,
  TO_CHAR(p.data_conclusao, 'Mon/YY') AS mes_label,
  COUNT(p.id) AS total_ordens,
  COALESCE(SUM(p.total_metal), 0) AS total_metal,
  COALESCE(SUM(p.quebra), 0) AS total_quebra,
  CASE
    WHEN SUM(p.total_metal) > 0
    THEN ROUND((SUM(p.quebra) / NULLIF(SUM(p.total_metal), 0) * 100)::numeric, 2)
    ELSE 0
  END AS percentual_quebra
FROM directus.pcp p
WHERE p.etapas = '5'
  AND p.data_conclusao IS NOT NULL
  AND p.total_metal > 0
GROUP BY DATE_TRUNC('month', p.data_conclusao), TO_CHAR(p.data_conclusao, 'Mon/YY')
ORDER BY mes DESC
LIMIT 12;

-- ═══ 7. VIEW QUEBRA POR DEPOSITO ═══
DROP VIEW IF EXISTS alissonerp.vw_quebra_por_deposito;

CREATE VIEW alissonerp.vw_quebra_por_deposito AS
SELECT
  dep.id AS deposito_id,
  dep.nome AS deposito_nome,
  COALESCE(SUM(CASE WHEN ce.entrada > 0 THEN ce.entrada ELSE 0 END), 0) AS total_entrada,
  COALESCE(SUM(CASE WHEN ce.saida > 0 THEN ce.saida ELSE 0 END), 0) AS total_saida,
  COALESCE(SUM(COALESCE(ce.entrada,0)), 0) - COALESCE(SUM(COALESCE(ce.saida,0)), 0) AS saldo
FROM directus.controle_estoque ce
JOIN directus.deposito dep ON ce.deposito_id = dep.id
GROUP BY dep.id, dep.nome
ORDER BY saldo DESC;

COMMENT ON VIEW alissonerp.vw_ordens_completa IS 'Ordens enriquecidas com mapeamento de codigos e JOINs. LEITURA.';
COMMENT ON VIEW alissonerp.vw_estoque_directus_saldo IS 'Saldo de estoque de directus.controle_estoque. LEITURA.';
COMMENT ON VIEW alissonerp.vw_movimentacoes_directus IS 'Movimentacoes recentes do Directus com nomes. LEITURA.';
COMMENT ON VIEW alissonerp.vw_insumos_directus IS 'Insumos do Directus com status de estoque. LEITURA.';
COMMENT ON VIEW alissonerp.vw_quebra_por_ourives IS 'Quebra de ouro por ourives (PCP concluidos). LEITURA.';
COMMENT ON VIEW alissonerp.vw_quebra_mensal IS 'Tendencia mensal de quebra de ouro. LEITURA.';
COMMENT ON VIEW alissonerp.vw_quebra_por_deposito IS 'Saldo de controle_estoque por deposito. LEITURA.';
