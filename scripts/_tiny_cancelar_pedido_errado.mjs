import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const PEDIDO_TINY_ID = 752499604;
const VENDA_LOCAL_ID = 15051; // (numero_venda=4155, criada por engano)

const [row] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_bearer_token'`;
let token; try { token = JSON.parse(row.valor_encrypted); } catch { token = row.valor_encrypted; }
token = token.replace(/"/g, '').trim();

// Tenta cancelar via PATCH situacao=cancelado (situacao 2 no mapeamento Tiny)
// API v3: PUT /pedidos/{id}/situacao com payload { situacao: "cancelado" } (varia)
// Tentativa 1: PUT /pedidos/{id} com situacao
console.log('--- Tentando cancelar pedido', PEDIDO_TINY_ID, '---');
let res = await fetch(`https://api.tiny.com.br/public-api/v3/pedidos/${PEDIDO_TINY_ID}/situacao`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ situacao: 2 }), // 2 = cancelado
});
console.log('PUT /situacao →', res.status, await res.text().then(t => t.slice(0, 300)));

if (!res.ok) {
  // Tenta outro formato
  res = await fetch(`https://api.tiny.com.br/public-api/v3/pedidos/${PEDIDO_TINY_ID}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  console.log('DELETE →', res.status, await res.text().then(t => t.slice(0, 300)));
}

// Limpa estado local (independente do que aconteceu no Tiny)
await sql`
  UPDATE alissonerp.vendas_erp
  SET tiny_pedido_id = NULL, tiny_sync_status = 'pendente', tiny_sync_at = NULL, tiny_sync_erro = 'Reenvio incorreto revertido'
  WHERE id = ${VENDA_LOCAL_ID}
`;
const [v] = await sql`SELECT id, numero_venda, tiny_pedido_id, tiny_sync_status, tiny_sync_erro FROM alissonerp.vendas_erp WHERE id = ${VENDA_LOCAL_ID}`;
console.log('\nVenda local revertida:', v);

await sql.end();
