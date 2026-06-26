-- ============================================================================
-- MIGRATION 075: Campo detalhes_ordem — trazer do Directus sem reimportar
-- Estratégia: ADD COLUMN + UPDATE via directus_ordem_id + recrear view
-- ============================================================================

-- ── 1. ADICIONAR COLUNA ─────────────────────────────────────────────────────

ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS detalhes_ordem TEXT;

COMMENT ON COLUMN alissonerp.ordens.detalhes_ordem IS
  'Detalhes/observações da ordem — migrado do directus.ordens.detalhes_ordem via directus_ordem_id';

-- ── 2. POPULAR COM DADOS DO DIRECTUS ────────────────────────────────────────

UPDATE alissonerp.ordens ao
SET detalhes_ordem = d.detalhes_ordem
FROM directus.ordens d
WHERE ao.directus_ordem_id = d.id
  AND d.detalhes_ordem IS NOT NULL
  AND d.detalhes_ordem != '';

-- ── 3. RECRIAR vw_ordem_detalhe INCLUINDO detalhes_ordem ───────────────────

CREATE OR REPLACE VIEW alissonerp.vw_ordem_detalhe AS
 SELECT o.id,
    o.numero_ordem,
    (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            WHEN 'criado'::text THEN 'Criado'::text
            WHEN 'rascunho'::text THEN 'Rascunho'::text
            ELSE 'Desconhecido'::text
        END AS situacao,
    (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE 'Aguardando'::text
        END AS status,
    (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'::text THEN 'PCP'::text
            WHEN 'protocolo'::text THEN 'Protocolo'::text
            ELSE '—'::text
        END AS rota,
    (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
            WHEN 'servico_loja'::text  THEN 'Serviço Loja'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE '—'::text
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated,
    o.foto_peca_servico,
    o.peso_peca_servico,
    o.video_observacao,
    o.detalhes_ordem,
    p.id AS pcp_id,
    (p.etapas)::text AS pcp_etapas_cod,
        CASE (p.etapas)::text
            WHEN 'novas_ordens'::text THEN 'Novas Ordens'::text
            WHEN 'pendencia'::text THEN 'Pendência'::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            ELSE '—'::text
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
    p.bloqueado AS pcp_bloqueado,
    p.data_conclusao AS pcp_data_conclusao,
    p.local_atual AS pcp_local_atual,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sem operador'::text) AS pcp_operador_nome,
    dist.id AS dist_id,
    (dist.setor)::text AS dist_setor,
    (dist.etapas)::text AS dist_etapas_cod,
        CASE (dist.etapas)::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE NULL::text
        END AS dist_etapas,
    dist.pmc AS dist_pmc,
    dist.quebra AS dist_quebra,
    dist.porcentagem_de_quebra AS dist_quebra_pct
FROM ((((((((alissonerp.ordens o
    LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
    LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
    LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
    LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
    LEFT JOIN alissonerp.pcp p ON ((p.ordem_id = o.id)))
    LEFT JOIN auth.users au ON ((au.id = p.operador)))
    LEFT JOIN user_profiles up ON ((up.id_user = au.id)))
    LEFT JOIN alissonerp.distribuicoes dist ON ((dist.id = o.distribuicao_id)));

-- ── 4. GRANTS ───────────────────────────────────────────────────────────────

GRANT SELECT ON alissonerp.vw_ordem_detalhe TO anon, authenticated;
