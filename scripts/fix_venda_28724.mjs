// Fix manual da venda #28724 que ficou em rascunho porque o webhook MP
// abortou por causa do token Tiny expirado. O pagamento está confirmado
// no banco mas a transição rascunho→concluido não aconteceu.
//
// Esse script simula o que o concluirVenda faria (sem chamar Tiny).
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Fix venda #28724 ===\n');

try {
  // 1. Estado atual
  const [antes] = await sql`
    SELECT id, numero_venda, situacao, total_venda, tiny_pedido_id,
           tiny_sync_status, tiny_sync_erro
    FROM alissonerp.vendas_erp WHERE id = 28724
  `;
  if (!antes) throw new Error('Venda 28724 não encontrada');
  console.log(`Antes: venda #${antes.id} (${antes.numero_venda})`);
  console.log(`  situacao=${antes.situacao} tiny_pedido_id=${antes.tiny_pedido_id}`);

  const [pagAntes] = await sql`
    SELECT id, status, valor FROM alissonerp.pagamentos_venda
    WHERE venda_id = 28724 AND status = 'confirmado' AND gateway LIKE 'Mercado Pago%'
    ORDER BY id DESC LIMIT 1
  `;
  console.log(`  pag#${pagAntes?.id} status=${pagAntes?.status} valor=${pagAntes?.valor}`);

  if (antes.situacao === 'concluido') {
    console.log('✅ Venda já está concluída. Nada a fazer.');
    process.exit(0);
  }

  // 2. Transicionar rascunho → aprovado (sem Tiny)
  console.log('\n── Transicionando rascunho → aprovado (Tiny será reenviado depois) ──');
  await sql`
    UPDATE alissonerp.vendas_erp
    SET
      situacao         = 'aprovado',
      tiny_sync_status = 'erro',
      tiny_sync_erro   = 'Token Tiny expirado quando webhook MP chegou. Reenviar manualmente.',
      updated_at       = NOW()
    WHERE id = 28724
  `;
  console.log('  ✅ situacao=aprovado');

  // 3. Transicionar aprovado → concluido (trigger 113 vai criar contas_receber)
  console.log('\n── Transicionando aprovado → concluido ──');
  await sql`
    UPDATE alissonerp.vendas_erp
    SET situacao = 'concluido', updated_at = NOW()
    WHERE id = 28724
  `;
  console.log('  ✅ situacao=concluido (trigger 113 criou contas_receber automaticamente)');

  // 4. Marcar contas_receber como pago
  console.log('\n── Marcando contas_receber como pago ──');
  const [{ fn_cr_marcar_pago_mp: qtd }] = await sql`
    SELECT alissonerp.fn_cr_marcar_pago_mp(28724) AS fn_cr_marcar_pago_mp
  `;
  console.log(`  ✅ ${qtd} conta(s) receber marcada(s) como pago`);

  // 5. Estado final
  console.log('\n── Estado final ──');
  const [depois] = await sql`
    SELECT situacao, tiny_sync_status, tiny_sync_erro
    FROM alissonerp.vendas_erp WHERE id = 28724
  `;
  console.log(`  venda.situacao=${depois.situacao}`);
  console.log(`  tiny_sync_status=${depois.tiny_sync_status}`);
  console.log(`  tiny_sync_erro=${depois.tiny_sync_erro?.slice(0, 80)}`);

  const crs = await sql`
    SELECT id, valor, situacao, data_recebimento
    FROM alissonerp.contas_receber WHERE venda_erp_id = 28724
  `;
  console.log(`\n  contas_receber: ${crs.length} registro(s)`);
  crs.forEach(c => console.log(`    CR#${c.id} R$${c.valor} situacao=${c.situacao} recebimento=${c.data_recebimento}`));

  console.log('\n✅ FIX APLICADO COM SUCESSO');
  console.log('Tiny ficou como pendente de reenvio — reconecte o Tiny em Configurações > Integrações');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
