-- =============================================
-- MIGRATION 039: peso_metal_externo DA ORDEM na vw_auditorias_completa
-- o.peso_metal_externo (campo da ordem) ≠ a.metal_externo (campo da auditoria)
-- Adicionado ao final do SELECT (CREATE OR REPLACE seguro).
-- =============================================

CREATE OR REPLACE VIEW alissonerp.vw_auditorias_completa AS
SELECT a.id,
  a.situacao,
  CASE a.situacao
    WHEN 'pendente'    THEN 'Pendente'::character varying
    WHEN 'em_analise'  THEN 'Em Análise'::character varying
    WHEN 'aprovado'    THEN 'Aprovada'::character varying
    WHEN 'reprovado'   THEN 'Reprovada'::character varying
    WHEN 'pendenciado' THEN 'Pendenciada'::character varying
    ELSE a.situacao
  END AS situacao_label,
  a.tipo_auditoria,
  CASE a.tipo_auditoria
    WHEN 'loja'    THEN 'Auditoria Loja'::character varying
    WHEN 'fabrica' THEN 'Auditoria Fábrica'::character varying
    ELSE COALESCE(a.tipo_auditoria, 'Outro'::character varying)
  END AS tipo_auditoria_label,
  a.rota_processo,
  a.ordem_id,
  o.numero_ordem,
  o.numero_pedido,
  o.tipo_ordem::text AS tipo_ordem,
  o.rota::text AS rota_ordem,
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
    WHEN COALESCE(a.peso_negociado, 0::real) > 0::double precision
     AND COALESCE(a.peso_final,     0::real) > 0::double precision
    THEN round(((a.peso_final - a.peso_negociado) / a.peso_negociado * 100::double precision)::numeric, 1)
    ELSE 0::numeric
  END AS diff_peso_pct,
  a.responsavel_id,
  up.name AS responsavel_nome,
  a.parecer,
  a.motivo_reprovacao,
  a.tipo_retrabalho,
  a.ordem_retrabalho_id,
  oret.numero_ordem AS ordem_retrabalho_numero,
  c.nome AS cliente_nome,
  v.nome AS vendedor_nome,
  a.created_at,
  a.data_conclusao,
  round(EXTRACT(epoch FROM COALESCE(a.data_conclusao, now()) - a.created_at) / 86400.0, 1) AS dias_analise,
  o.data_entrega,
  COALESCE(o.peso_metal_externo, 0::real) AS peso_metal_externo
FROM alissonerp.auditorias a
  LEFT JOIN alissonerp.ordens o    ON o.id          = a.ordem_id
  LEFT JOIN user_profiles     up   ON up.id_user    = a.responsavel_id
  LEFT JOIN alissonerp.ordens oret ON oret.id       = a.ordem_retrabalho_id
  LEFT JOIN contatos          c    ON c.id_contato  = o.cliente_id
  LEFT JOIN vendedores        v    ON v.id_vendedor = o.vendedor_id;

GRANT SELECT ON alissonerp.vw_auditorias_completa TO anon, authenticated;
