import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

async function readTinyToken() {
  const [row] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
  if (!row?.valor_encrypted) return null;
  let t; try { t = JSON.parse(row.valor_encrypted); } catch { t = String(row.valor_encrypted); }
  return t.replace(/"/g, '').trim() || null;
}

const token = await readTinyToken();

// Tenta buscar pelo ID 213 (esperado: 404), e também busca contatos com nome "generico"
console.log('--- GET /contatos/213 ---');
let res = await fetch('https://api.tiny.com.br/public-api/v3/contatos/213', { headers: { 'Authorization': `Bearer ${token}` } });
console.log(res.status, await res.text().then(t => t.slice(0, 200)));

console.log('\n--- GET /contatos?nome=generico ---');
res = await fetch('https://api.tiny.com.br/public-api/v3/contatos?nome=generico', { headers: { 'Authorization': `Bearer ${token}` } });
const txt = await res.text();
console.log(res.status, txt.slice(0, 1500));

console.log('\n--- GET /contatos?nome=consumidor ---');
res = await fetch('https://api.tiny.com.br/public-api/v3/contatos?nome=consumidor', { headers: { 'Authorization': `Bearer ${token}` } });
console.log(res.status, await res.text().then(t => t.slice(0, 1500)));

await sql.end();
