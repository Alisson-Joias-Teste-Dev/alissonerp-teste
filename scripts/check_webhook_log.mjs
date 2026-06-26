import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Últimos 5 logs do webhook mercado-pago ===\n');

const logs = await sql`
  SELECT id, created_at, response_status, erro, payload
  FROM alissonerp.webhook_log
  WHERE webhook_nome = 'mercado-pago-payment'
  ORDER BY created_at DESC
  LIMIT 5
`;

if (logs.length === 0) {
  console.log('⚠️  Nenhum log encontrado. Webhook não chegou ao endpoint.');
} else {
  logs.forEach((log, i) => {
    console.log(`─── Log #${i + 1} (id=${log.id}) ───`);
    console.log(`  created_at     : ${log.created_at.toISOString()}`);
    console.log(`  response_status: ${log.response_status ?? 'NULL'}`);
    console.log(`  erro           : ${log.erro ?? '(sem erro)'}`);
    const payload = log.payload;
    if (payload) {
      if (payload.headers) {
        console.log(`  headers.x-sig  : ${payload.headers['x-signature']?.slice(0, 50) ?? 'null'}...`);
        console.log(`  headers.x-req  : ${payload.headers['x-request-id'] ?? 'null'}`);
      }
      if (payload.query) {
        console.log(`  query          : ${JSON.stringify(payload.query)}`);
      }
      if (payload.body) {
        console.log(`  body.type      : ${payload.body.type}`);
        console.log(`  body.data.id   : ${payload.body.data?.id}`);
      }
      if (payload.resultado) {
        console.log(`  resultado      : ${payload.resultado}`);
      }
      if (payload.venda_id) {
        console.log(`  venda_id       : ${payload.venda_id}`);
      }
    }
    console.log();
  });
}

await sql.end();
