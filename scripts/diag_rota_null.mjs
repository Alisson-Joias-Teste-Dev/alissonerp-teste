import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// Ordens servico com rota=NULL (não são retrabalhos)
const rows = await sql`
  SELECT o.id, o.numero_ordem, o.status, o.situacao, o.id_ordem_relacionada,
         a.situacao AS audit_status
  FROM alissonerp.ordens o
  LEFT JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja'
  WHERE o.tipo_ordem = 'servico'
    AND o.rota IS NULL
    AND o.id_ordem_relacionada IS NULL
  ORDER BY o.id DESC
`;
console.log(`Servico + rota=NULL + não-retrabalho: ${rows.length} ordens`);
console.log(JSON.stringify(rows, null, 2));

await sql.end();
