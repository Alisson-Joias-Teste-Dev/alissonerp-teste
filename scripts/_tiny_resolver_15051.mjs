/**
 * Resolve venda 15051 no Tiny:
 * 1. Verifica se o tiny_pedido_id atual (8234790031815) existe no Tiny
 * 2. Se sim: só corrige tiny_sync_status local
 * 3. Se não: limpa tiny_pedido_id, recria no Tiny e atualiza local
 */
import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const VENDA_ID = 15051;

// ── Token Tiny ───────────────────────────────────────────────────────────
async function readTinyToken() {
  const [row] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'
  `;
  if (!row?.valor_encrypted) return null;
  let t; try { t = JSON.parse(row.valor_encrypted); } catch { t = String(row.valor_encrypted); }
  return t.replace(/"/g, '').trim() || null;
}

async function refreshTinyToken() {
  const [ciRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_id'`;
  const [csRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_client_secret'`;
  const [rtRow] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_refresh_token'`;
  if (!ciRow?.valor_encrypted || !csRow?.valor_encrypted) return null;
  const parse = v => { try { return JSON.parse(v); } catch { return String(v); } };
  const clientId = parse(ciRow.valor_encrypted).replace(/"/g, '').trim();
  const clientSecret = parse(csRow.valor_encrypted).replace(/"/g, '').trim();
  const attempts = [];
  if (rtRow?.valor_encrypted) {
    const rt = parse(rtRow.valor_encrypted).replace(/"/g, '').trim();
    if (rt) attempts.push(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId, client_secret: clientSecret }));
  }
  attempts.push(new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }));
  for (const body of attempts) {
    try {
      const res = await fetch('https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      });
      if (!res.ok) continue;
      const tokens = await res.json();
      await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_bearer_token', ${JSON.stringify(tokens.access_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.access_token)}`;
      if (tokens.refresh_token) await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_refresh_token', ${JSON.stringify(tokens.refresh_token)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(tokens.refresh_token)}`;
      if (tokens.expires_in) {
        const ea = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
        await sql`INSERT INTO alissonerp.configuracoes_secrets (chave, valor_encrypted) VALUES ('tiny_token_expires_at', ${JSON.stringify(ea)}) ON CONFLICT (chave) DO UPDATE SET valor_encrypted = ${JSON.stringify(ea)}`;
      }
      return tokens.access_token;
    } catch { continue; }
  }
  return null;
}

async function ensureTinyToken() {
  let token = await readTinyToken();
  if (!token) {
    token = await refreshTinyToken();
    if (!token) throw new Error('Token Tiny não configurado.');
  }
  return token;
}

// ── Etapa 1: ver venda + verificar se pedido existe no Tiny ──
const [v] = await sql`
  SELECT v.id, v.numero_venda, v.tiny_pedido_id, v.tiny_sync_status
  FROM alissonerp.vendas_erp v WHERE v.id = ${VENDA_ID}
`;
console.log(`Venda ${VENDA_ID} (#${v.numero_venda}) → tiny_pedido_id=${v.tiny_pedido_id} status=${v.tiny_sync_status}`);

let token = await ensureTinyToken();
console.log('Token obtido:', token.slice(0, 16) + '...');

if (v.tiny_pedido_id) {
  // Verifica se pedido existe no Tiny
  const url = `https://api.tiny.com.br/public-api/v3/pedidos/${v.tiny_pedido_id}`;
  let res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401) {
    token = await refreshTinyToken();
    res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  }
  console.log(`GET ${url} → ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log('Pedido existe no Tiny:', JSON.stringify({ id: data.id, numero: data.numero, situacao: data.situacao }, null, 2));
    console.log('\n→ Apenas atualizando status local pra "sincronizado"');
    await sql`
      UPDATE alissonerp.vendas_erp
      SET tiny_sync_status = 'sincronizado', tiny_sync_at = NOW(), tiny_sync_erro = NULL
      WHERE id = ${VENDA_ID}
    `;
    console.log('✅ Status local sincronizado.');
  } else if (res.status === 404) {
    const errBody = await res.text();
    console.log('Pedido NÃO existe no Tiny (404):', errBody.slice(0, 200));
    console.log('\n→ Limpando tiny_pedido_id e marcando como pendente pra reenvio');
    await sql`
      UPDATE alissonerp.vendas_erp
      SET tiny_pedido_id = NULL, tiny_sync_status = 'pendente', tiny_sync_erro = NULL
      WHERE id = ${VENDA_ID}
    `;
    console.log('✅ Pronto pra reenvio. Rode `node scripts/_tiny_enviar_15051.mjs` em seguida.');
  } else {
    const errBody = await res.text();
    console.log('Resposta inesperada do Tiny:', res.status, errBody.slice(0, 300));
  }
}

await sql.end();
