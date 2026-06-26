
SET search_path TO alissonerp;

-- ═══ 1. VIEW DETALHE COMPLETO DA ORDEM ═══
DROP VIEW IF EXISTS alissonerp.vw_ordem_detalhe;

CREATE VIEW alissonerp.vw_ordem_detalhe AS
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
  o.date_updated,

  -- PCP vinculado
  p.id AS pcp_id,
  p.etapas AS pcp_etapas_cod,
  CASE p.etapas
    WHEN '1' THEN 'Novas Ordens'
    WHEN '2' THEN 'Pendência'
    WHEN '3' THEN 'Aguardando'
    WHEN '4' THEN 'Em Andamento'
    WHEN '5' THEN 'Concluído'
    WHEN '6' THEN 'Cancelado'
    ELSE '—'
  END AS pcp_etapas,
  p.total_metal AS pcp_total_metal,
  p.retorno_metal AS pcp_retorno_metal,
  p.total_pedras_un AS pcp_total_pedras_un,
  p.total_pedras_g AS pcp_total_pedras_g,
  p.total_geral_outros_pesos AS pcp_total_outros,
  p.pmc AS pcp_pmc,
  p.quebra AS pcp_quebra,
  p.porcentagem_de_quebra AS pcp_quebra_pct,
  p.peso_final AS pcp_peso_final,
  p.metal_externo AS pcp_metal_externo,
  p."Bloqueado" AS pcp_bloqueado,
  p.data_conclusao AS pcp_data_conclusao,
  p.local_atual AS pcp_local_atual,

  -- Operador do PCP (operador e varchar/uuid)
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email,
    'Sem operador'
  ) AS pcp_operador_nome,

  -- Distribuicao vinculada
  dist.id AS dist_id,
  dist.setor AS dist_setor,
  dist.etapas AS dist_etapas_cod,
  CASE dist.etapas
    WHEN '1' THEN 'Em Andamento'
    WHEN '2' THEN 'Concluído'
    ELSE NULL
  END AS dist_etapas,
  dist.pmc AS dist_pmc,
  dist.quebra AS dist_quebra,
  dist.porcentagem_de_quebra AS dist_quebra_pct

FROM directus.ordens o
LEFT JOIN directus.setor s ON o.setor_atual = s.id
LEFT JOIN directus.deposito d ON o.local_atual = d.id
LEFT JOIN public.vendedores v ON o.vendedor_id = v.id_vendedor
LEFT JOIN public.contatos c ON o.cliente_id = c.id_contato
LEFT JOIN directus.pcp p ON p.ordem_id = o.id
LEFT JOIN directus.directus_users du ON p.operador::uuid = du.id
LEFT JOIN directus.distribuicao dist ON o.distribuicao_id = dist.id;

-- ═══ 2. VIEW APONTAMENTOS DA ORDEM ═══
DROP VIEW IF EXISTS alissonerp.vw_apontamentos_ordem;

CREATE VIEW alissonerp.vw_apontamentos_ordem AS
SELECT
  a.id,
  a.pcp_id,
  p.ordem_id,
  o.numero_ordem,
  a.qtd,
  a.date_created AS data,
  ta.id AS tipo_id,
  ta.descricao AS tipo_descricao,
  ins.id AS insumo_id,
  ins.nome AS insumo_nome,
  ins.sku AS insumo_sku,
  cat.nome AS insumo_categoria,
  dep.nome AS deposito_nome,
  st.descricao AS setor_nome,
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email,
    'Sistema'
  ) AS criado_por
FROM directus.apontamento a
LEFT JOIN directus.pcp p ON a.pcp_id = p.id
LEFT JOIN directus.ordens o ON p.ordem_id = o.id
LEFT JOIN directus.tipo_apontamento ta ON a.tipo_apontamento = ta.id
LEFT JOIN directus.insumos ins ON a.insumo = ins.id
LEFT JOIN directus.categoria_insumo cat ON ins.categoria_id = cat.id
LEFT JOIN directus.deposito dep ON a.deposito = dep.id
LEFT JOIN directus.setor st ON a.setor = st.id
LEFT JOIN directus.directus_users du ON a.user_created = du.id;

-- ═══ 3. VIEW MOVIMENTACOES DE ESTOQUE DA ORDEM ═══
DROP VIEW IF EXISTS alissonerp.vw_estoque_ordem;

CREATE VIEW alissonerp.vw_estoque_ordem AS
SELECT
  ce.id,
  ce.entrada,
  ce.saida,
  ce.marcador,
  ce.data_hora,
  ce.date_created,
  ce.ordem_id,
  o.numero_ordem,
  ins.nome AS insumo_nome,
  dep.nome AS deposito_nome,
  st.descricao AS setor_nome
FROM directus.controle_estoque ce
LEFT JOIN directus.ordens o ON ce.ordem_id = o.id
LEFT JOIN directus.insumos ins ON ce.insumo_id = ins.id
LEFT JOIN directus.deposito dep ON ce.deposito_id = dep.id
LEFT JOIN directus.setor st ON ce.setor = st.id;

-- ═══ 4. VIEW TRANSFERENCIAS DA ORDEM ═══
-- transferencia_ordem usa coluna "pcp" (nao pcp_id) e tem ordem_id direto
DROP VIEW IF EXISTS alissonerp.vw_transferencias_ordem;

CREATE VIEW alissonerp.vw_transferencias_ordem AS
SELECT
  t.id,
  t.pcp AS pcp_id,
  t.ordem_id,
  o.numero_ordem,
  t.date_created AS data,
  dep.nome AS deposito_nome,
  st.descricao AS setor_nome,
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email,
    'Sistema'
  ) AS criado_por
FROM directus.transferencia_ordem t
LEFT JOIN directus.ordens o ON t.ordem_id = o.id
LEFT JOIN directus.deposito dep ON t.deposito_id = dep.id
LEFT JOIN directus.setor st ON t.setor_id = st.id
LEFT JOIN directus.directus_users du ON t.user_created = du.id;

-- ═══ 5. VIEW PROTOCOLOS IDA ═══
-- protocolo nao tem motoboy/recebedor como coluna — usa user_created
-- rota e texto livre (ex: 'Loja -> Fabrica'), nao codigo
DROP VIEW IF EXISTS alissonerp.vw_protocolos_completo;

CREATE VIEW alissonerp.vw_protocolos_completo AS
SELECT
  pr.id,
  pr.rota AS direcao,
  pr.etapas AS etapas_cod,
  CASE pr.etapas
    WHEN '1' THEN 'Pendente'
    WHEN '2' THEN 'Em Trânsito'
    WHEN '3' THEN 'Concluído'
    ELSE 'Pendente'
  END AS etapas,
  pr.date_created AS data_criacao,
  pr.date_updated AS data_atualizacao,
  pr.data_conclusao,
  pr.obs,
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email
  ) AS criado_por,
  (SELECT count(*) FROM directus.protocolo_ordens_4 po WHERE po.protocolo_id = pr.id) AS total_ordens
FROM directus.protocolo pr
LEFT JOIN directus.directus_users du ON pr.user_created = du.id;

-- ═══ 6. VIEW ORDENS POR PROTOCOLO ═══
DROP VIEW IF EXISTS alissonerp.vw_protocolo_ordens;

CREATE VIEW alissonerp.vw_protocolo_ordens AS
SELECT
  po.id,
  po.protocolo_id,
  po.ordens_id AS ordem_id,
  o.numero_ordem,
  o.cliente_id,
  c.nome AS cliente_nome,
  o.peso_metal_negocido AS peso_metal_negociado,
  o.status,
  CASE o.status
    WHEN '1' THEN 'Aguardando'
    WHEN '2' THEN 'Em Andamento'
    WHEN '3' THEN 'Concluído'
    ELSE '—'
  END AS status_label
FROM directus.protocolo_ordens_4 po
LEFT JOIN directus.ordens o ON po.ordens_id = o.id
LEFT JOIN public.contatos c ON o.cliente_id = c.id_contato;

-- ═══ 7. VIEW PROTOCOLO LOJA (volta) ═══
DROP VIEW IF EXISTS alissonerp.vw_protocolos_loja_completo;

CREATE VIEW alissonerp.vw_protocolos_loja_completo AS
SELECT
  pl.id,
  pl.rota AS direcao,
  pl.etapas AS etapas_cod,
  CASE pl.etapas
    WHEN '1' THEN 'Pendente'
    WHEN '2' THEN 'Em Trânsito'
    WHEN '3' THEN 'Concluído'
    ELSE 'Pendente'
  END AS etapas,
  pl.date_created AS data_criacao,
  pl.data_conclusao,
  pl.obs,
  COALESCE(
    NULLIF(TRIM(COALESCE(du.first_name,'') || ' ' || COALESCE(du.last_name,'')), ''),
    du.email
  ) AS criado_por,
  (SELECT count(*) FROM directus.protocolo_loja_ordens_1 plo WHERE plo.protocolo_loja_id = pl.id) AS total_ordens
FROM directus.protocolo_loja pl
LEFT JOIN directus.directus_users du ON pl.user_created = du.id;

COMMENT ON VIEW alissonerp.vw_ordem_detalhe IS 'Detalhe completo: ordem + PCP + distribuicao + operador. LEITURA.';
COMMENT ON VIEW alissonerp.vw_apontamentos_ordem IS 'Apontamentos PCP da ordem com tipos e insumos. LEITURA.';
COMMENT ON VIEW alissonerp.vw_estoque_ordem IS 'Movimentacoes de estoque da ordem. LEITURA.';
COMMENT ON VIEW alissonerp.vw_transferencias_ordem IS 'Transferencias entre setores da ordem. LEITURA.';
COMMENT ON VIEW alissonerp.vw_protocolos_completo IS 'Protocolos ida com criador e contagem de ordens. LEITURA.';
COMMENT ON VIEW alissonerp.vw_protocolo_ordens IS 'Ordens vinculadas a cada protocolo. LEITURA.';
COMMENT ON VIEW alissonerp.vw_protocolos_loja_completo IS 'Protocolos volta (loja) com criador. LEITURA.';
