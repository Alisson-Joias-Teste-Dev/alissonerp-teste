import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

const views = await sql`
  SELECT viewname, pg_get_viewdef(schemaname || '.' || viewname, true) as def
  FROM pg_views WHERE schemaname = 'alissonerp' AND viewname LIKE '%protocolo%'
`;
for (const r of views) {
  console.log('=== ' + r.viewname + ' ===');
  console.log(r.def);
  console.log('');
}

const q7 = await sql`
  SELECT o.id, o.numero_ordem, o.situacao, o.status, o.rota, o.tipo_ordem,
         a.situacao AS audit_status
  FROM alissonerp.ordens o
  LEFT JOIN alissonerp.auditorias a ON a.ordem_id = o.id AND a.tipo_auditoria = 'loja'
  WHERE o.rota = 'protocolo'
  ORDER BY o.id DESC LIMIT 10
`;
console.log('Q7 ordens rota=protocolo recentes:', JSON.stringify(q7, null, 2));

await sql.end();
