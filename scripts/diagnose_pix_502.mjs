import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Diagnóstico erro 502 criar-pix ===\n');

// 1. Pagamentos MP Pix recentes (venda 28722)
console.log('── Pagamentos da venda 28722 ──');
const pags = await sql`
  SELECT id, forma, gateway, valor, status, gateway_id, gateway_payload, created_at
  FROM alissonerp.pagamentos_venda
  WHERE venda_id = 28722
  ORDER BY id DESC
`;
pags.forEach(p => {
  console.log(`  #${p.id} ${p.forma}/${p.gateway} R$${p.valor} status=${p.status}`);
  console.log(`    gateway_id=${p.gateway_id}`);
  console.log(`    payload=${JSON.stringify(p.gateway_payload).slice(0, 400)}`);
});

// 2. Config mp_webhook_base_url
console.log('\n── configuracoes_secrets (MP) ──');
const secrets = await sql`
  SELECT chave,
    CASE WHEN valor_encrypted IS NULL THEN 'NULL'
         WHEN LENGTH(valor_encrypted) > 30 THEN SUBSTRING(valor_encrypted, 1, 30) || '...'
         ELSE valor_encrypted END AS valor
  FROM alissonerp.configuracoes_secrets
  WHERE chave LIKE 'mp_%'
  ORDER BY chave
`;
secrets.forEach(s => console.log(`  ${s.chave} = ${s.valor}`));

// 3. Webhook log (últimos erros MP)
console.log('\n── webhook_log últimos erros ──');
const logs = await sql`
  SELECT created_at, response_status, erro
  FROM alissonerp.webhook_log
  WHERE webhook_nome = 'mercado-pago-payment'
    AND (erro IS NOT NULL OR response_status >= 400)
  ORDER BY created_at DESC
  LIMIT 5
`;
if (logs.length === 0) console.log('  (nenhum erro logado)');
logs.forEach(l => console.log(`  ${l.created_at.toISOString()} | ${l.response_status} | ${l.erro?.slice(0, 150)}`));

await sql.end();
