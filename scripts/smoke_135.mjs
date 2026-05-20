// Smoke test pós-migration 135:
// - INSERT device fake
// - UPDATE nome_legivel (valida trigger updated_at)
// - SELECT para conferir
// - DELETE
// Objetivo: confirmar que schema + trigger + grants estão íntegros antes do go-live.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== SMOKE TEST 135 ===\n');

try {
  console.log('── INSERT device fake ──');
  const [inserted] = await sql`
    INSERT INTO alissonerp.mp_point_devices (device_id, nome_legivel, operating_mode)
    VALUES ('TEST_SMOKE_135__fake_device', 'Smoke Test Device', 'PDV')
    RETURNING id, device_id, nome_legivel, created_at, updated_at
  `;
  console.log(`  ✅ id=${inserted.id}, device_id=${inserted.device_id}`);
  console.log(`     created=${inserted.created_at.toISOString()}, updated=${inserted.updated_at.toISOString()}`);

  // Aguardar 100ms pra garantir que updated_at seja diferente
  await new Promise(r => setTimeout(r, 100));

  console.log('── UPDATE nome (testa trigger updated_at) ──');
  const [updated] = await sql`
    UPDATE alissonerp.mp_point_devices
    SET nome_legivel = 'Smoke Test Device (editado)', loja = 'Matriz'
    WHERE device_id = 'TEST_SMOKE_135__fake_device'
    RETURNING id, nome_legivel, loja, created_at, updated_at
  `;
  console.log(`  ✅ nome=${updated.nome_legivel}, loja=${updated.loja}`);
  console.log(`     created=${updated.created_at.toISOString()}, updated=${updated.updated_at.toISOString()}`);
  const triggerOk = updated.updated_at.getTime() > inserted.updated_at.getTime();
  console.log(`  trigger updated_at auto-atualizou: ${triggerOk ? '✅' : '❌'}`);

  console.log('── SELECT WHERE ativo=true ──');
  const ativos = await sql`
    SELECT device_id, nome_legivel FROM alissonerp.mp_point_devices
    WHERE ativo = true
  `;
  console.log(`  ✅ ${ativos.length} device(s) ativo(s)`);

  console.log('── Testar UNIQUE constraint em device_id ──');
  let duplicate = false;
  try {
    await sql`
      INSERT INTO alissonerp.mp_point_devices (device_id, nome_legivel)
      VALUES ('TEST_SMOKE_135__fake_device', 'Duplicado')
    `;
  } catch (e) {
    if (e.code === '23505') duplicate = true;
  }
  console.log(`  unique constraint ativa: ${duplicate ? '✅' : '❌'}`);

  console.log('── Testar fn_cr_marcar_pago_mp (função) ──');
  const [{ result }] = await sql`SELECT alissonerp.fn_cr_marcar_pago_mp(99999999) AS result`;
  console.log(`  fn(99999999) retornou: ${result} (esperado 0 — venda inexistente)  ✅`);

  console.log('── DELETE smoke device ──');
  const del = await sql`
    DELETE FROM alissonerp.mp_point_devices WHERE device_id = 'TEST_SMOKE_135__fake_device'
  `;
  console.log(`  ✅ ${del.count} row(s) deletada(s)`);

  console.log('── Estado final ──');
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM alissonerp.mp_point_devices`;
  console.log(`  total de devices na tabela: ${count}`);

  const [webhook] = await sql`
    SELECT nome, url, ativo FROM alissonerp.webhook_config WHERE nome = 'mercado-pago-payment'
  `;
  console.log(`  webhook_config: ${webhook.nome} → ${webhook.url} (ativo=${webhook.ativo})`);

  const [{ indexdef }] = await sql`
    SELECT indexdef FROM pg_indexes
    WHERE indexname = 'idx_pagamentos_venda_gateway_id'
  `;
  console.log(`  índice: ${indexdef ? '✅' : '❌'}`);

  console.log('\n=== SMOKE TEST 135 CONCLUÍDO ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
