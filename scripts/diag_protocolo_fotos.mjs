import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// Tabela protocolo_fotos existe?
const exists = await sql`
  SELECT table_schema, table_name FROM information_schema.tables
  WHERE table_name = 'protocolo_fotos'
`;
console.log('protocolo_fotos:', JSON.stringify(exists, null, 2));

// Ordens já em protocolo ativo (para filtrar na view)
const ativas = await sql`
  SELECT po.ordem_id, p.id AS protocolo_id, p.etapas, p.direcao
  FROM alissonerp.protocolo_ordens po
  JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
  WHERE p.etapas != 'concluido'
  LIMIT 10
`;
console.log('\nOrdens em protocolo ativo:', JSON.stringify(ativas, null, 2));

// Checar vw_ordens_prontas_ida — ela já filtra ordens em protocolo ativo?
const viewDef = await sql`
  SELECT pg_get_viewdef('alissonerp.vw_ordens_prontas_ida', true) as def
`;
console.log('\nvw_ordens_prontas_ida def:', viewDef[0].def);

// Storage bucket protocolo-fotos: políticas
const policies = await sql`
  SELECT policyname, cmd, roles FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%protocolo%'
`;
console.log('\nStorage policies protocolo:', JSON.stringify(policies, null, 2));

await sql.end();
