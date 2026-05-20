import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Setup mp_webhook_base_url ===\n');

const URL_PUBLICA = 'https://erp.alissonjoias.com.br';

// Valor é armazenado como JSON stringified (padrão do endpoint PATCH)
const valor = JSON.stringify(URL_PUBLICA);

await sql`
  INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted)
  VALUES ('mp_webhook_base_url', ${valor})
  ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${valor}
`;
console.log(`✅ mp_webhook_base_url = ${URL_PUBLICA}`);

// Validação — confirmar que ficou
const [row] = await sql`
  SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'mp_webhook_base_url'
`;
console.log(`\nValor no banco: ${row?.valor_encrypted}`);

// Simula como o helper getWebhookBaseUrl vai ler
let v = row.valor_encrypted;
try { v = JSON.parse(v); } catch { /* já era string */ }
v = String(v).replace(/"/g, '').trim();
console.log(`Decodificado: ${v}`);
console.log(`notification_url resultante: ${v}/api/webhooks/mercado-pago`);

await sql.end();
