// Busca um payment real na API MP pra ver os campos de valor líquido
// e taxas que estão disponíveis.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Investigando net_received_amount no payload MP ===\n');

// 1. Pega um pagamento MP real com gateway_id
const [pag] = await sql`
  SELECT id, venda_id, gateway_id, gateway, gateway_payload
  FROM alissonerp.pagamentos_venda
  WHERE gateway LIKE 'Mercado Pago%'
    AND gateway_id IS NOT NULL
    AND status = 'confirmado'
  ORDER BY id DESC
  LIMIT 1
`;
if (!pag) { console.log('Nenhum pagamento MP confirmado encontrado'); process.exit(0); }
console.log(`Pagamento escolhido: pag#${pag.id} venda#${pag.venda_id} gateway=${pag.gateway} mp_id=${pag.gateway_id}`);

// 2. Pega access token
const [tok] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'mp_access_token'`;
const accessToken = String(tok.valor_encrypted).replace(/"/g, '').trim();

// 3. Busca o payment direto na API MP
const res = await fetch(`https://api.mercadopago.com/v1/payments/${pag.gateway_id}`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!res.ok) {
  console.log('Erro MP:', res.status, await res.text());
  process.exit(1);
}
const payment = await res.json();

console.log('\n── Campos financeiros relevantes ──');
console.log('  transaction_amount         :', payment.transaction_amount);
console.log('  transaction_amount_refunded:', payment.transaction_amount_refunded);
console.log('  taxes_amount               :', payment.taxes_amount);
console.log('  fee_details                :', JSON.stringify(payment.fee_details));
console.log('  transaction_details        :', JSON.stringify(payment.transaction_details));
console.log('  status                     :', payment.status);
console.log('  payment_method_id          :', payment.payment_method_id);
console.log('  payment_type_id            :', payment.payment_type_id);
console.log('  installments               :', payment.installments);
console.log('  currency_id                :', payment.currency_id);
console.log('  date_approved              :', payment.date_approved);
console.log('  money_release_date         :', payment.money_release_date);
console.log('  charges_details            :', JSON.stringify(payment.charges_details).slice(0, 200));

console.log('\n── Cálculo do líquido ──');
const bruto = Number(payment.transaction_amount ?? 0);
const fees = (payment.fee_details ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0);
const liquido = payment.transaction_details?.net_received_amount ?? (bruto - fees);
console.log(`  bruto       R$ ${bruto.toFixed(2)}`);
console.log(`  fees total  R$ ${fees.toFixed(2)}`);
console.log(`  líquido     R$ ${Number(liquido).toFixed(2)}`);

console.log('\n── O que já está salvo em gateway_payload ──');
console.log(JSON.stringify(pag.gateway_payload, null, 2).slice(0, 1000));

await sql.end();
