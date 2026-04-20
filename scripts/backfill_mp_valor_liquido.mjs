// Backfill retroativo: busca cada pagamento MP existente na API e preenche
// valor_liquido + taxas_mp + reescreve gateway_payload corretamente.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Backfill valor_liquido + taxas_mp + gateway_payload ===\n');

// Pega access token
const [tok] = await sql`SELECT valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'mp_access_token'`;
const accessToken = String(tok.valor_encrypted).replace(/"/g, '').trim();
if (!accessToken) { console.log('❌ Access token MP não configurado'); process.exit(1); }

// Pega pagamentos MP confirmados que ainda não têm valor_liquido
const pags = await sql`
  SELECT id, venda_id, valor, gateway, gateway_id, data_confirmacao
  FROM alissonerp.pagamentos_venda
  WHERE gateway LIKE 'Mercado Pago%'
    AND gateway_id IS NOT NULL
    AND status = 'confirmado'
    AND valor_liquido IS NULL
  ORDER BY id
`;
console.log(`${pags.length} pagamentos precisam de backfill\n`);

let sucesso = 0, falha = 0;
for (const p of pags) {
  process.stdout.write(`pag#${p.id} mp=${p.gateway_id} R$${p.valor} ... `);
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${p.gateway_id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.log(`❌ API ${res.status}`);
      falha++;
      continue;
    }
    const payment = await res.json();

    const txAmount = Number(payment.transaction_amount ?? 0);
    const netRecv  = payment.transaction_details?.net_received_amount;
    const valorLiquido = netRecv != null ? Number(netRecv) : txAmount;
    // taxas = bruto - líquido (mais preciso que somar fee_details)
    const fees = Math.max(0, Number((txAmount - valorLiquido).toFixed(2)));

    const novoPayload = {
      ultimo_payment_id: String(payment.id),
      ultimo_status: payment.status,
      ultimo_update: new Date().toISOString(),
      backfilled: true,
      point_of_interaction_type: payment.point_of_interaction?.type ?? null,
      payment_method_id: payment.payment_method_id ?? null,
      payment_type_id: payment.payment_type_id ?? null,
      transaction_amount: txAmount,
      net_received_amount: Number(netRecv ?? valorLiquido),
      taxas_mp_total: fees,
      fee_details: payment.fee_details ?? [],
      money_release_date: payment.money_release_date ?? null,
      payment_ids_processados: [String(payment.id)],
    };

    await sql`
      UPDATE alissonerp.pagamentos_venda
      SET
        valor_liquido   = ${valorLiquido},
        taxas_mp        = ${fees},
        gateway_payload = ${JSON.stringify(novoPayload)}::text::jsonb
      WHERE id = ${p.id}
    `;
    console.log(`✅ líquido R$${valorLiquido.toFixed(2)} taxas R$${fees.toFixed(2)}`);
    sucesso++;
  } catch (e) {
    console.log(`❌ ${e.message}`);
    falha++;
  }
}

console.log(`\n${sucesso} sucesso, ${falha} falhas`);

// Resumo final
console.log('\n── fn_resumo_recebido_mp() após backfill ──');
const [resumo] = await sql`SELECT * FROM alissonerp.fn_resumo_recebido_mp()`;
console.log(`  qtd           = ${resumo.qtd}`);
console.log(`  total_bruto   = R$ ${Number(resumo.total_bruto).toFixed(2)}`);
console.log(`  total_taxas   = R$ ${Number(resumo.total_taxas).toFixed(2)}`);
console.log(`  total_liquido = R$ ${Number(resumo.total_liquido).toFixed(2)}`);

await sql.end();
