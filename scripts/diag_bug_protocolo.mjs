import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== Q1: Detalhes protocolos 148-151 ===');
const q1 = await sql`
  SELECT id, direcao::text, etapas::text, motoboy_id, recebedor_id, created_by,
         foto_criacao, created_at
  FROM alissonerp.protocolos WHERE id IN (148,149,150,151) ORDER BY id
`;
console.log(JSON.stringify(q1, null, 2));

console.log('\n=== Q2: Ordens vinculadas ===');
const q2 = await sql`
  SELECT po.protocolo_id, po.ordem_id, o.numero_ordem
  FROM alissonerp.protocolo_ordens po
  JOIN alissonerp.ordens o ON o.id = po.ordem_id
  WHERE po.protocolo_id IN (149,150,151)
  ORDER BY po.protocolo_id
`;
console.log(JSON.stringify(q2, null, 2));

console.log('\n=== Q3: Timestamps diff ===');
const q3 = await sql`
  SELECT id, created_at,
    (created_at - lag(created_at) OVER (ORDER BY id)) AS diff
  FROM alissonerp.protocolos WHERE id IN (149,150,151)
`;
console.log(JSON.stringify(q3, null, 2));

await sql.end();
