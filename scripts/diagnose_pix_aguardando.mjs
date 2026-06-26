import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Diagnóstico: Pix pago mas ficou aguardando ===\n');

// 1. Últimos pagamentos MP Pix
console.log('── Últimos 5 pagamentos MP Pix ──');
const pags = await sql`
  SELECT p.id, p.venda_id, p.valor, p.status, p.gateway, p.gateway_id,
         p.data_confirmacao, p.created_at,
         v.numero_venda, v.situacao AS venda_situacao
  FROM alissonerp.pagamentos_venda p
  JOIN alissonerp.vendas_erp v ON v.id = p.venda_id
  WHERE p.gateway LIKE 'Mercado Pago%'
  ORDER BY p.id DESC
  LIMIT 5
`;
pags.forEach(p => {
  console.log(`  pag#${p.id} venda#${p.venda_id}(${p.numero_venda}) ${p.gateway}`);
  console.log(`    valor=${p.valor} status=${p.status} venda.situacao=${p.venda_situacao}`);
  console.log(`    gateway_id=${p.gateway_id}`);
  console.log(`    confirmacao=${p.data_confirmacao} created=${p.created_at?.toISOString()}`);
});

// 2. Último pagamento — payload completo
if (pags.length > 0) {
  console.log('\n── Payload do último pagamento ──');
  const [ultimo] = await sql`
    SELECT gateway_payload FROM alissonerp.pagamentos_venda WHERE id = ${pags[0].id}
  `;
  console.log(JSON.stringify(ultimo?.gateway_payload, null, 2));
}

// 3. Últimos 10 logs webhook mercado-pago
console.log('\n── Últimos 10 webhook_log (mercado-pago-payment) ──');
const logs = await sql`
  SELECT id, created_at, response_status, erro,
         payload::text AS payload_text
  FROM alissonerp.webhook_log
  WHERE webhook_nome = 'mercado-pago-payment'
  ORDER BY created_at DESC
  LIMIT 10
`;
if (logs.length === 0) {
  console.log('  ⚠️  ZERO logs — webhook não chegou no servidor!');
} else {
  logs.forEach(l => {
    console.log(`  #${l.id} ${l.created_at?.toISOString()} status=${l.response_status ?? '—'}`);
    if (l.erro) console.log(`    ERRO: ${l.erro.slice(0, 200)}`);
    const t = l.payload_text ?? '';
    console.log(`    payload: ${t.slice(0, 200)}...`);
  });
}

// 4. Estado dos secrets
console.log('\n── Secrets MP atuais (primeiros chars) ──');
const secrets = await sql`
  SELECT chave, SUBSTRING(valor_encrypted, 1, 40) AS preview
  FROM alissonerp.configuracoes_secrets
  WHERE chave LIKE 'mp_%'
  ORDER BY chave
`;
secrets.forEach(s => console.log(`  ${s.chave.padEnd(24)} = ${s.preview}`));

await sql.end();
