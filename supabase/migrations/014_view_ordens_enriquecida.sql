-- =============================================
-- MIGRATION 014: VIEW ORDENS ENRIQUECIDA
-- Mapeia códigos legados + JOINs com nomes
-- =============================================
SET search_path TO alissonerp;

-- Dropar view antiga
DROP VIEW IF EXISTS alissonerp.vw_ordens_directus;

-- View enriquecida com mapeamento de valores e JOINs
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
    WHEN '3' THEN 'Concluido'
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
    WHEN '1' THEN 'Producao'
    WHEN '2' THEN 'Reparo'
    WHEN '3' THEN 'Ajuste'
    WHEN '4' THEN 'Banho'
    WHEN '5' THEN 'Gravacao'
    WHEN '6' THEN 'Reposicao'
    WHEN '7' THEN 'Outro'
    ELSE '—'
  END AS tipo_ordem,

  -- Setor (directus.setor usa coluna "descricao")
  o.setor_atual AS setor_id,
  s.descricao AS setor_nome,

  -- Deposito
  o.local_atual AS deposito_id,
  d.nome AS deposito_nome,

  -- Vendedor
  o.vendedor_id,
  v.nome AS vendedor_nome,

  -- Cliente
  o.cliente_id,
  c.nome AS cliente_nome,

  -- Dados de producao
  o.peso_metal_negocido AS peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.pedido_id,

  -- Timestamps
  o.date_created,
  o.date_updated

FROM directus.ordens o
LEFT JOIN directus.setor s ON o.setor_atual = s.id
LEFT JOIN directus.deposito d ON o.local_atual = d.id
LEFT JOIN public.vendedores v ON o.vendedor_id = v.id_vendedor
LEFT JOIN public.contatos c ON o.cliente_id = c.id_contato;

-- View de PCP do Directus (com mapeamento de etapas)
CREATE VIEW alissonerp.vw_pcp_completa AS
SELECT
  p.id,
  p.ordem_id,

  p.etapas AS etapas_cod,
  CASE p.etapas
    WHEN '1' THEN 'Novas Ordens'
    WHEN '2' THEN 'Pendencia'
    WHEN '3' THEN 'Aguardando'
    WHEN '4' THEN 'Em Andamento'
    WHEN '5' THEN 'Concluido'
    WHEN '6' THEN 'Cancelado'
    ELSE 'Desconhecido'
  END AS etapas,

  p.total_metal,
  p.retorno_metal,
  p.total_pedras_un,
  p.total_pedras_g,
  p.pmc,
  p.quebra,
  p.porcentagem_de_quebra,
  p.peso_final,
  p.metal_externo,
  p."Bloqueado" AS bloqueado,
  p.local_atual,
  p.data_conclusao,
  p.date_created,
  p.operador,

  -- Dados da ordem
  o.numero_ordem,
  o.cliente_id,
  c.nome AS cliente_nome,
  o.vendedor_id,
  v.nome AS vendedor_nome,
  o.peso_metal_negocido AS peso_metal_negociado,
  o.data_entrega,

  -- Setor e deposito da ordem
  s.descricao AS setor_nome,
  d.nome AS deposito_nome

FROM directus.pcp p
LEFT JOIN directus.ordens o ON p.ordem_id = o.id
LEFT JOIN public.contatos c ON o.cliente_id = c.id_contato
LEFT JOIN public.vendedores v ON o.vendedor_id = v.id_vendedor
LEFT JOIN directus.setor s ON o.setor_atual = s.id
LEFT JOIN directus.deposito d ON o.local_atual = d.id;

COMMENT ON VIEW alissonerp.vw_ordens_completa IS 'View enriquecida das ordens do Directus com mapeamento de codigos + JOINs. SOMENTE LEITURA.';
COMMENT ON VIEW alissonerp.vw_pcp_completa IS 'View enriquecida do PCP do Directus com etapas mapeadas + dados da ordem. SOMENTE LEITURA.';
