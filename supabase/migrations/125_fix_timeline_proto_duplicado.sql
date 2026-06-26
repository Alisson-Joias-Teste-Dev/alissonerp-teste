-- ============================================================
-- 125 — Fix timeline duplicando linhas de protocolo ida/volta
--       O JOIN protocolo_ordens retornava todas as linhas (ida+volta)
--       gerando uma linha fantasma "pendente" para cada direção
-- ============================================================

DROP VIEW IF EXISTS alissonerp.vw_timeline_ordem;

CREATE VIEW alissonerp.vw_timeline_ordem AS
WITH ev_criacao AS (
  SELECT o.id AS ordem_id, 1 AS passo,
    'criacao'::text AS evento_cod, 'Criação da Ordem'::text AS evento,
    o.created_at AS data_evento, 'concluido'::text AS status, NULL::text AS detalhe
  FROM alissonerp.ordens o
),
ev_audit_loja AS (
  SELECT o.id AS ordem_id, 2 AS passo,
    'auditoria_loja'::text AS evento_cod, 'Auditoria Loja'::text AS evento,
    CASE WHEN a.situacao = 'aprovado' THEN a.data_conclusao ELSE NULL END AS data_evento,
    CASE WHEN a.situacao = 'aprovado' THEN 'concluido' WHEN a.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    a.parecer AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja' AND a.situacao != 'reprovado'
),
ev_proto_ida AS (
  SELECT o.id AS ordem_id, 3 AS passo,
    'protocolo_ida'::text AS evento_cod, 'Protocolo Ida'::text AS evento,
    CASE WHEN p.etapas = 'concluido' THEN p.data_conclusao ELSE NULL END AS data_evento,
    CASE WHEN p.etapas = 'concluido' THEN 'concluido' WHEN p.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    NULL::text AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN LATERAL (
    SELECT p2.id, p2.etapas, p2.data_conclusao
    FROM alissonerp.protocolo_ordens po2
    JOIN alissonerp.protocolos p2 ON p2.id = po2.protocolo_id AND p2.direcao = 'ida'
    WHERE po2.ordem_id = o.id
    ORDER BY p2.id DESC LIMIT 1
  ) p ON true
),
ev_pcp AS (
  SELECT o.id AS ordem_id, 4 AS passo,
    'pcp'::text AS evento_cod, 'PCP'::text AS evento,
    CASE WHEN pcp.etapas = 'concluido' THEN pcp.data_conclusao ELSE pcp.created_at END AS data_evento,
    CASE WHEN pcp.etapas = 'concluido' THEN 'concluido' WHEN pcp.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    NULL::text AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN LATERAL (
    SELECT pcp_1.id, pcp_1.etapas, pcp_1.data_conclusao, pcp_1.created_at
    FROM alissonerp.pcp pcp_1
    WHERE pcp_1.ordem_id = o.id
    ORDER BY pcp_1.created_at DESC NULLS LAST LIMIT 1
  ) pcp ON true
),
ev_audit_fab AS (
  SELECT o.id AS ordem_id, 5 AS passo,
    'auditoria_fabrica'::text AS evento_cod, 'Auditoria Fábrica'::text AS evento,
    CASE WHEN a.situacao = 'aprovado' THEN a.data_conclusao ELSE NULL END AS data_evento,
    CASE WHEN a.situacao = 'aprovado' THEN 'concluido' WHEN a.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    a.parecer AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'fabrica' AND a.situacao != 'reprovado'
),
ev_proto_volta AS (
  SELECT o.id AS ordem_id, 6 AS passo,
    'protocolo_volta'::text AS evento_cod, 'Protocolo Volta'::text AS evento,
    CASE WHEN p.etapas = 'concluido' THEN p.data_conclusao ELSE NULL END AS data_evento,
    CASE WHEN p.etapas = 'concluido' THEN 'concluido' WHEN p.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    NULL::text AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN LATERAL (
    SELECT p2.id, p2.etapas, p2.data_conclusao
    FROM alissonerp.protocolo_ordens po2
    JOIN alissonerp.protocolos p2 ON p2.id = po2.protocolo_id AND p2.direcao = 'volta'
    WHERE po2.ordem_id = o.id
    ORDER BY p2.id DESC LIMIT 1
  ) p ON true
),
ev_aprovacao AS (
  SELECT o.id AS ordem_id, 7 AS passo,
    'aprovacao_consultora'::text AS evento_cod, 'Aprovação Consultora'::text AS evento,
    CASE WHEN ac.etapas = 'aprovado' THEN ac.updated_at ELSE NULL END AS data_evento,
    CASE WHEN ac.etapas = 'aprovado' THEN 'concluido' WHEN ac.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    ac.obs AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN LATERAL (
    SELECT aprovacoes_consultora.id, aprovacoes_consultora.etapas, aprovacoes_consultora.updated_at, aprovacoes_consultora.obs
    FROM alissonerp.aprovacoes_consultora
    WHERE aprovacoes_consultora.ordem_id = o.id
    ORDER BY aprovacoes_consultora.updated_at DESC NULLS LAST LIMIT 1
  ) ac ON true
),
ev_entrega AS (
  SELECT o.id AS ordem_id, 8 AS passo,
    'preparacao_entrega'::text AS evento_cod, 'Preparação Entrega'::text AS evento,
    CASE WHEN pe.etapas = 'concluido' THEN pe.updated_at ELSE NULL END AS data_evento,
    CASE WHEN pe.etapas = 'concluido' THEN 'concluido' WHEN pe.id IS NOT NULL THEN 'em_andamento' ELSE 'pendente' END AS status,
    NULL::text AS detalhe
  FROM alissonerp.ordens o
  LEFT JOIN LATERAL (
    SELECT preparacoes_entrega.id, preparacoes_entrega.etapas, preparacoes_entrega.updated_at
    FROM alissonerp.preparacoes_entrega
    WHERE preparacoes_entrega.ordem_id = o.id
    ORDER BY preparacoes_entrega.updated_at DESC NULLS LAST LIMIT 1
  ) pe ON true
)
SELECT * FROM ev_criacao
UNION ALL SELECT * FROM ev_audit_loja
UNION ALL SELECT * FROM ev_proto_ida
UNION ALL SELECT * FROM ev_pcp
UNION ALL SELECT * FROM ev_audit_fab
UNION ALL SELECT * FROM ev_proto_volta
UNION ALL SELECT * FROM ev_aprovacao
UNION ALL SELECT * FROM ev_entrega
ORDER BY 1, 2;
