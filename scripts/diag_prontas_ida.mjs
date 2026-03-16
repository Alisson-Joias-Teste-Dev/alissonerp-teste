import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// Ver se a view existe e sua definição
const views = await sql`
  SELECT viewname, pg_get_viewdef(schemaname || '.' || viewname, true) as def
  FROM pg_views WHERE schemaname = 'alissonerp' AND viewname LIKE '%prontas%'
`;
console.log('Views prontas:', views.map(v => v.viewname));
for (const r of views) {
  console.log('=== ' + r.viewname + ' ===');
  console.log(r.def);
  console.log('');
}

// Verificar se a view existe no schema public também
const viewsPub = await sql`
  SELECT viewname FROM pg_views WHERE viewname LIKE '%prontas%'
`;
console.log('Views prontas (todos schemas):', JSON.stringify(viewsPub, null, 2));

// C-1046: rota=null, situacao=criado, status=aguardando, auditoria=aprovado
// O problema: rota IS NULL — a view provavelmente filtra rota='protocolo'
const c1046 = await sql`
  SELECT id, numero_ordem, tipo_ordem, rota, situacao, status
  FROM alissonerp.ordens WHERE numero_ordem = 'C-1046'
`;
console.log('C-1046 estado atual:', JSON.stringify(c1046, null, 2));

await sql.end();
