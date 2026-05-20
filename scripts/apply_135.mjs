// Apply migration 135: Mercado Pago integração — base
// - webhook_config entry for receiver
// - mp_point_devices table + trigger + grants
// - índice gateway_id em pagamentos_venda
// - fn_cr_marcar_pago_mp helper
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 135: MERCADO PAGO INTEGRAÇÃO ===\n');

try {
  console.log('── 1. Webhook config entry ──');
  await sql`
    INSERT INTO alissonerp.webhook_config (nome, url, descricao, ativo)
    VALUES (
      'mercado-pago-payment',
      '/api/webhooks/mercado-pago',
      'Receiver de notificações MP (Payment Link + Point Smart)',
      true
    )
    ON CONFLICT (nome) DO NOTHING
  `;
  console.log('  ✅ webhook_config row inserida');

  console.log('── 2. Índice gateway_id em pagamentos_venda ──');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pagamentos_venda_gateway_id
      ON alissonerp.pagamentos_venda (gateway_id)
      WHERE gateway_id IS NOT NULL
  `;
  console.log('  ✅ índice criado (ou já existia)');

  console.log('── 3. Tabela mp_point_devices ──');
  await sql`
    CREATE TABLE IF NOT EXISTS alissonerp.mp_point_devices (
      id             SERIAL PRIMARY KEY,
      device_id      TEXT NOT NULL UNIQUE,
      nome_legivel   TEXT NOT NULL,
      store_id       TEXT,
      pos_id         TEXT,
      operating_mode TEXT,
      ativo          BOOLEAN NOT NULL DEFAULT true,
      loja           TEXT,
      last_sync_at   TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('  ✅ mp_point_devices criada');

  console.log('── 4. Índice parcial ativo ──');
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mp_point_devices_ativo
      ON alissonerp.mp_point_devices (ativo)
      WHERE ativo = true
  `;
  console.log('  ✅ índice criado');

  console.log('── 5. Função updated_at trigger ──');
  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_mp_point_devices()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $$
  `;
  console.log('  ✅ função criada');

  console.log('── 6. Trigger updated_at ──');
  await sql`DROP TRIGGER IF EXISTS trg_updated_at_mp_point_devices ON alissonerp.mp_point_devices`;
  await sql`
    CREATE TRIGGER trg_updated_at_mp_point_devices
      BEFORE UPDATE ON alissonerp.mp_point_devices
      FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_mp_point_devices()
  `;
  console.log('  ✅ trigger criado');

  console.log('── 7. Função fn_cr_marcar_pago_mp ──');
  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_cr_marcar_pago_mp(p_venda_id INTEGER)
    RETURNS INTEGER LANGUAGE plpgsql AS $$
    DECLARE
      v_count INTEGER;
    BEGIN
      UPDATE alissonerp.contas_receber
      SET
        situacao         = 'pago',
        data_recebimento = CURRENT_DATE,
        updated_at       = NOW()
      WHERE venda_erp_id = p_venda_id
        AND situacao     = 'pendente';

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN v_count;
    END;
    $$
  `;
  console.log('  ✅ fn_cr_marcar_pago_mp criada');

  console.log('── 8. Grants ──');
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.mp_point_devices TO authenticated`;
  await sql`GRANT USAGE, SELECT ON SEQUENCE alissonerp.mp_point_devices_id_seq TO authenticated`;
  await sql`GRANT EXECUTE ON FUNCTION alissonerp.fn_cr_marcar_pago_mp(INTEGER) TO authenticated`;
  await sql`GRANT EXECUTE ON FUNCTION alissonerp.fn_updated_at_mp_point_devices() TO authenticated`;
  console.log('  ✅ grants aplicados');

  // ═══ VALIDAÇÃO ═══
  console.log('\n── VALIDAÇÃO ──');

  const [{ exists: tableExists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = 'mp_point_devices'
    ) AS exists
  `;
  console.log(`  tabela mp_point_devices: ${tableExists ? '✅' : '❌'}`);

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'mp_point_devices'
    ORDER BY ordinal_position
  `;
  console.log(`  colunas (${cols.length}): ${cols.map(c => c.column_name).join(', ')}`);

  const [idx] = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'alissonerp' AND indexname = 'idx_pagamentos_venda_gateway_id'
  `;
  console.log(`  índice gateway_id: ${idx ? '✅' : '❌'}`);

  const [fn1] = await sql`
    SELECT proname FROM pg_proc WHERE proname = 'fn_cr_marcar_pago_mp'
  `;
  console.log(`  função fn_cr_marcar_pago_mp: ${fn1 ? '✅' : '❌'}`);

  const [whook] = await sql`
    SELECT nome, url, ativo FROM alissonerp.webhook_config WHERE nome = 'mercado-pago-payment'
  `;
  console.log(`  webhook_config entry: ${whook ? '✅ ' + whook.url : '❌'}`);

  const [{ result: testFn }] = await sql`
    SELECT alissonerp.fn_cr_marcar_pago_mp(-1) AS result
  `;
  console.log(`  fn_cr_marcar_pago_mp(-1) retorna: ${testFn} (esperado 0)`);

  console.log('\n=== MIGRATION 135 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
