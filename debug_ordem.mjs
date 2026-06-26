import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres');

// Check saldo_credito_loja - this is likely the gerente's A Receber limit
const scl = await sql`SELECT * FROM alissonerp.saldo_credito_loja ORDER BY created_at DESC LIMIT 10`;
console.log('saldo_credito_loja:', JSON.stringify(scl, null, 2));

// Check how A Receber is currently handled in the approval flow
const ar = await sql`SELECT id, venda_erp_id, valor, situacao, created_by FROM alissonerp.contas_receber WHERE situacao = 'pendente' ORDER BY created_at DESC LIMIT 5`;
console.log('A Receber pendentes:', JSON.stringify(ar, null, 2));
await sql.end();
