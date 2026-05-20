import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

// Confirmar que 149 e 150 não têm ordens
const ordens = await sql`
  SELECT protocolo_id, count(*) FROM alissonerp.protocolo_ordens
  WHERE protocolo_id IN (149, 150) GROUP BY protocolo_id
`;
console.log('Ordens em 149/150:', ordens);

if (ordens.length === 0) {
  await sql`DELETE FROM alissonerp.protocolos WHERE id IN (149, 150)`;
  console.log('Protocolos 149 e 150 deletados.');
} else {
  console.log('ATENÇÃO: têm ordens vinculadas — não deletando');
}

const restantes = await sql`
  SELECT id, etapas::text, motoboy_id FROM alissonerp.protocolos ORDER BY id DESC LIMIT 5
`;
console.log('Últimos protocolos:', JSON.stringify(restantes, null, 2));
await sql.end();
