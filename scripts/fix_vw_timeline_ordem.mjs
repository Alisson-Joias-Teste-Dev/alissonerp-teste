import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const fixSQL = `
CREATE OR REPLACE VIEW alissonerp.vw_timeline_ordem AS
WITH
  -- 1. Criação da Ordem
  ev_criacao AS (
    SELECT
      o.id                   AS ordem_id,
      1                      AS passo,
      'criacao'              AS evento_cod,
      'Criação da Ordem'     AS evento,
      o.created_at           AS data_evento,
      'concluido'            AS status,
      NULL::text             AS detalhe
    FROM alissonerp.ordens o
  ),

  -- 2. Auditoria Loja
  ev_audit_loja AS (
    SELECT
      o.id                   AS ordem_id,
      2                      AS passo,
      'auditoria_loja'       AS evento_cod,
      'Auditoria Loja'       AS evento,
      CASE WHEN a.situacao = 'aprovado' THEN a.data_conclusao ELSE NULL END AS data_evento,
      CASE
        WHEN a.situacao = 'aprovado' THEN 'concluido'
        WHEN a.id IS NOT NULL        THEN 'em_andamento'
        ELSE                              'pendente'
      END                    AS status,
      a.parecer              AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.auditorias a
      ON  a.ordem_id       = o.id
      AND a.tipo_auditoria = 'loja'
      AND a.situacao       != 'reprovado'
  ),

  -- 3. Protocolo Ida
  ev_proto_ida AS (
    SELECT
      o.id                   AS ordem_id,
      3                      AS passo,
      'protocolo_ida'        AS evento_cod,
      'Protocolo Ida'        AS evento,
      CASE WHEN p.etapas = 'concluido' THEN p.data_conclusao ELSE NULL END AS data_evento,
      CASE
        WHEN p.etapas = 'concluido' THEN 'concluido'
        WHEN p.id IS NOT NULL        THEN 'em_andamento'
        ELSE                              'pendente'
      END                    AS status,
      NULL::text             AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
    LEFT JOIN alissonerp.protocolos p
      ON  p.id      = po.protocolo_id
      AND p.direcao = 'ida'
  ),

  -- 4. PCP (último por ordem)
  ev_pcp AS (
    SELECT
      o.id                   AS ordem_id,
      4                      AS passo,
      'pcp'                  AS evento_cod,
      'PCP'                  AS evento,
      CASE WHEN pcp.etapas = 'concluido' THEN pcp.data_conclusao ELSE pcp.created_at END AS data_evento,
      CASE
        WHEN pcp.etapas = 'concluido' THEN 'concluido'
        WHEN pcp.id IS NOT NULL        THEN 'em_andamento'
        ELSE                                'pendente'
      END                    AS status,
      NULL::text             AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN LATERAL (
      SELECT id, etapas, data_conclusao, created_at
      FROM alissonerp.pcp
      WHERE ordem_id = o.id
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    ) pcp ON true
  ),

  -- 5. Auditoria Fábrica
  ev_audit_fab AS (
    SELECT
      o.id                   AS ordem_id,
      5                      AS passo,
      'auditoria_fabrica'    AS evento_cod,
      'Auditoria Fábrica'    AS evento,
      CASE WHEN a.situacao = 'aprovado' THEN a.data_conclusao ELSE NULL END AS data_evento,
      CASE
        WHEN a.situacao = 'aprovado' THEN 'concluido'
        WHEN a.id IS NOT NULL        THEN 'em_andamento'
        ELSE                              'pendente'
      END                    AS status,
      a.parecer              AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.auditorias a
      ON  a.ordem_id       = o.id
      AND a.tipo_auditoria = 'fabrica'
      AND a.situacao       != 'reprovado'
  ),

  -- 6. Protocolo Volta
  ev_proto_volta AS (
    SELECT
      o.id                   AS ordem_id,
      6                      AS passo,
      'protocolo_volta'      AS evento_cod,
      'Protocolo Volta'      AS evento,
      CASE WHEN p.etapas = 'concluido' THEN p.data_conclusao ELSE NULL END AS data_evento,
      CASE
        WHEN p.etapas = 'concluido' THEN 'concluido'
        WHEN p.id IS NOT NULL        THEN 'em_andamento'
        ELSE                              'pendente'
      END                    AS status,
      NULL::text             AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN alissonerp.protocolo_ordens po ON po.ordem_id = o.id
    LEFT JOIN alissonerp.protocolos p
      ON  p.id      = po.protocolo_id
      AND p.direcao = 'volta'
  ),

  -- 7. Aprovação Consultora (última por ordem)
  ev_aprovacao AS (
    SELECT
      o.id                    AS ordem_id,
      7                       AS passo,
      'aprovacao_consultora'  AS evento_cod,
      'Aprovação Consultora'  AS evento,
      CASE WHEN ac.etapas = 'aprovado' THEN ac.updated_at ELSE NULL END AS data_evento,
      CASE
        WHEN ac.etapas = 'aprovado' THEN 'concluido'
        WHEN ac.id IS NOT NULL       THEN 'em_andamento'
        ELSE                              'pendente'
      END                     AS status,
      ac.obs                  AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN LATERAL (
      SELECT id, etapas, updated_at, obs
      FROM alissonerp.aprovacoes_consultora
      WHERE ordem_id = o.id
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    ) ac ON true
  ),

  -- 8. Preparação Entrega (última por ordem)
  ev_entrega AS (
    SELECT
      o.id                    AS ordem_id,
      8                       AS passo,
      'preparacao_entrega'    AS evento_cod,
      'Preparação Entrega'    AS evento,
      CASE WHEN pe.etapas = 'concluido' THEN pe.updated_at ELSE NULL END AS data_evento,
      CASE
        WHEN pe.etapas = 'concluido' THEN 'concluido'
        WHEN pe.id IS NOT NULL        THEN 'em_andamento'
        ELSE                               'pendente'
      END                     AS status,
      NULL::text              AS detalhe
    FROM alissonerp.ordens o
    LEFT JOIN LATERAL (
      SELECT id, etapas, updated_at
      FROM alissonerp.preparacoes_entrega
      WHERE ordem_id = o.id
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
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
ORDER BY ordem_id, passo;

COMMENT ON VIEW alissonerp.vw_timeline_ordem IS
  'Timeline de 8 passos por ordem com status real (concluido/em_andamento/pendente). Passo atual = primeiro em_andamento ou pendente.';
`;

console.log('Applying fix to vw_timeline_ordem...');
await sql.unsafe(fixSQL);
console.log('View updated successfully.');

// Verify the fix by sampling a few rows
const sample = await sql`
  SELECT ordem_id, passo, evento_cod, status, data_evento
  FROM alissonerp.vw_timeline_ordem
  ORDER BY ordem_id DESC, passo
  LIMIT 24
`;
console.log('\nSample rows (last 3 ordens):');
console.table(sample);

// Count rows by status per step to validate distribution
const dist = await sql`
  SELECT passo, evento_cod, status, count(*) AS total
  FROM alissonerp.vw_timeline_ordem
  GROUP BY passo, evento_cod, status
  ORDER BY passo, status
`;
console.log('\nStatus distribution per step:');
console.table(dist);

await sql.end();
