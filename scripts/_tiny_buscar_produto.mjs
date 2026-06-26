import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const [row] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
let token; try { token = JSON.parse(row.valor_encrypted); } catch { token = row.valor_encrypted; }
token = token.replace(/"/g, '').trim();

console.log('--- GET /produtos/123 ---');
let res = await fetch('https://api.tiny.com.br/public-api/v3/produtos/123', { headers: { 'Authorization': `Bearer ${token}` } });
console.log(res.status, await res.text().then(t => t.slice(0, 300)));

console.log('\n--- GET /produtos/746056974 ---');
res = await fetch('https://api.tiny.com.br/public-api/v3/produtos/746056974', { headers: { 'Authorization': `Bearer ${token}` } });
console.log(res.status, await res.text().then(t => t.slice(0, 400)));

console.log('\n--- GET /produtos?nome=generico ---');
res = await fetch('https://api.tiny.com.br/public-api/v3/produtos?nome=generico', { headers: { 'Authorization': `Bearer ${token}` } });
console.log(res.status, await res.text().then(t => t.slice(0, 1500)));

await sql.end();
