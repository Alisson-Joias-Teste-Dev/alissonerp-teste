-- =============================================
-- MIGRATION 034: NUMERO_PEDIDO NAS VIEWS
-- Adiciona o número do pedido PDV (public.pedidos.numero_pedido)
-- via LEFT JOIN public.pedidos p ON p.id = o.pedido_id
-- Campo: pedido_id existe em alissonerp.ordens (FK para public.pedidos.id)
-- =============================================

-- ─── 1. vw_auditorias_completa ───────────────────────────────────────────────

DROP VIEW IF EXISTS alissonerp.vw_auditorias_completa;
CREATE VIEW alissonerp.vw_auditorias_completa AS
SELECT
  a.id,
  a.situacao,
  CASE a.situacao
    WHEN 'pendente'    THEN 'Pendente'
    WHEN 'em_analise'  THEN 'Em Análise'
    WHEN 'aprovado'    THEN 'Aprovada'
    WHEN 'reprovado'   THEN 'Reprovada'
    WHEN 'pendenciado' THEN 'Pendenciada'
    ELSE a.situacao
  END AS situacao_label,
  a.tipo_auditoria,
  CASE a.tipo_auditoria
    WHEN 'loja'    THEN 'Auditoria Loja'
    WHEN 'fabrica' THEN 'Auditoria Fábrica'
    ELSE COALESCE(a.tipo_auditoria, 'Outro')
  END AS tipo_auditoria_label,
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  p.numero_pedido,                                 -- ← NOVO
  o.tipo_ordem::text   AS tipo_ordem,
  o.rota::text         AS rota_ordem,
  a.ourives_nome,
  COALESCE(a.peso_negociado,    0::real) AS peso_negociado,
  COALESCE(a.peso_final,        0::real) AS peso_final,
  COALESCE(a.pmc,               0::real) AS pmc,
  COALESCE(a.quebra,            0::real) AS quebra,
  COALESCE(a.quebra_percentual, 0::real) AS quebra_percentual,
  COALESCE(a.total_metal,       0::real) AS total_metal,
  COALESCE(a.retorno_metal,     0::real) AS retorno_metal,
  COALESCE(a.metal_externo,     0::real) AS metal_externo,
  a.ficha_tecnica_obs,
  a.dados_ordem,
  CASE
    WHEN COALESCE(a.peso_negociado, 0::real) > 0
     AND COALESCE(a.peso_final,     0::real) > 0
    THEN round(((a.peso_final - a.peso_negociado) / a.peso_negociado * 100::double precision)::numeric, 1)
    ELSE 0
  END AS diff_peso_pct,
  a.responsavel_id,
  up.name              AS responsavel_nome,
  a.parecer,
  a.motivo_reprovacao,
  a.tipo_retrabalho,
  a.ordem_retrabalho_id,
  oret.numero_ordem    AS ordem_retrabalho_numero,
  c.nome               AS cliente_nome,
  v.nome               AS vendedor_nome,
  a.created_at,
  a.data_conclusao,
  round(EXTRACT(epoch FROM COALESCE(a.data_conclusao, now()) - a.created_at) / 86400.0, 1) AS dias_analise
FROM alissonerp.auditorias a
LEFT JOIN alissonerp.ordens o    ON o.id              = a.ordem_id
LEFT JOIN public.pedidos    p    ON p.id              = o.pedido_id   -- ← NOVO
LEFT JOIN user_profiles     up   ON up.id_user        = a.responsavel_id
LEFT JOIN alissonerp.ordens oret ON oret.id           = a.ordem_retrabalho_id
LEFT JOIN contatos          c    ON c.id_contato      = o.cliente_id
LEFT JOIN vendedores        v    ON v.id_vendedor     = o.vendedor_id;

GRANT SELECT ON alissonerp.vw_auditorias_completa TO anon, authenticated;

-- ─── 2. vw_ordens_completa ───────────────────────────────────────────────────

DROP VIEW IF EXISTS alissonerp.vw_ordens_completa;
CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT
  o.id,
  o.numero_ordem,
  p.numero_pedido,                                 -- ← NOVO
  o.situacao::text AS situacao_cod,
  CASE o.situacao::text
    WHEN 'cancelado' THEN 'Cancelado'
    WHEN 'criado'    THEN 'Criado'
    WHEN 'rascunho'  THEN 'Rascunho'
    ELSE 'Desconhecido'
  END AS situacao,
  o.status::text AS status_cod,
  CASE o.status::text
    WHEN 'aguardando'   THEN 'Aguardando'
    WHEN 'em_andamento' THEN 'Em Andamento'
    WHEN 'concluido'    THEN 'Concluído'
    ELSE 'Aguardando'
  END AS status,
  o.rota::text AS rota_cod,
  CASE o.rota::text
    WHEN 'pcp'       THEN 'PCP'
    WHEN 'protocolo' THEN 'Protocolo'
    ELSE '—'
  END AS rota,
  o.tipo_ordem::text AS tipo_ordem_cod,
  CASE o.tipo_ordem::text
    WHEN 'servico'             THEN 'Serviço'
    WHEN 'fabricacao'          THEN 'Fabricação'
    WHEN 'reposicao_venda'     THEN 'Reposição Venda'
    WHEN 'reposicao_loja'      THEN 'Reposição Loja'
    WHEN 'compra_fornecedor'   THEN 'Compra de Fornecedor'
    WHEN 'garantia'            THEN 'Garantia'
    WHEN 'servico_interno'     THEN 'Serviço Interno'
    ELSE '—'
  END AS tipo_ordem,
  o.setor_atual  AS setor_id,
  s.nome         AS setor_nome,
  o.local_atual  AS deposito_id,
  d.nome         AS deposito_nome,
  o.vendedor_id,
  v.nome         AS vendedor_nome,
  o.cliente_id,
  c.nome         AS cliente_nome,
  o.peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.distribuicao_id,
  o.protocolo_loja,
  o.id_asana,
  o.created_at   AS date_created,
  o.updated_at   AS date_updated
FROM alissonerp.ordens o
LEFT JOIN public.pedidos    p ON p.id          = o.pedido_id    -- ← NOVO
LEFT JOIN alissonerp.setores   s ON s.id       = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id       = o.local_atual
LEFT JOIN vendedores        v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos          c ON c.id_contato  = o.cliente_id;

GRANT SELECT ON alissonerp.vw_ordens_completa TO anon, authenticated;
