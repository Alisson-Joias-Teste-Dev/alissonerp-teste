// Fix cirúrgico C-1707: verifica triggers antes de executar
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('FIX CIRÚRGICO — Ordem C-1707 → Protocolo Volta Service');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── FASE 1: AUDITORIA DE TRIGGERS ─────────────────────────────────────
  console.log('━━━ FASE 1: Verificando triggers ━━━\n');

  // Triggers em alissonerp.pcp
  console.log('📋 Triggers em alissonerp.pcp:');
  const triggersPcp = await sql`
    SELECT
      t.trigger_name,
      t.event_manipulation AS evento,
      t.action_timing AS quando,
      t.action_statement AS acao
    FROM information_schema.triggers t
    WHERE t.event_object_schema = 'alissonerp'
      AND t.event_object_table = 'pcp'
    ORDER BY t.trigger_name
  `;
  if (triggersPcp.length === 0) console.log('  (nenhum trigger)');
  else triggersPcp.forEach(t => {
    console.log(`  • ${t.trigger_name} — ${t.quando} ${t.evento}`);
    console.log(`    ${t.acao}`);
  });

  // Triggers em alissonerp.auditorias
  console.log('\n📋 Triggers em alissonerp.auditorias:');
  const triggersAud = await sql`
    SELECT
      t.trigger_name,
      t.event_manipulation AS evento,
      t.action_timing AS quando,
      t.action_statement AS acao
    FROM information_schema.triggers t
    WHERE t.event_object_schema = 'alissonerp'
      AND t.event_object_table = 'auditorias'
    ORDER BY t.trigger_name
  `;
  if (triggersAud.length === 0) console.log('  (nenhum trigger)');
  else triggersAud.forEach(t => {
    console.log(`  • ${t.trigger_name} — ${t.quando} ${t.evento}`);
    console.log(`    ${t.acao}`);
  });

  // Colunas obrigatórias de auditorias (pra INSERT completo)
  console.log('\n📋 Colunas NOT NULL de auditorias:');
  const colsAud = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'auditorias'
    ORDER BY ordinal_position
  `;
  colsAud.forEach(c => {
    const flag = c.is_nullable === 'NO' && !c.column_default ? ' ⚠️  OBRIGATÓRIO SEM DEFAULT' : '';
    console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : '(nullable)'}${c.column_default ? ' default=' + c.column_default : ''}${flag}`);
  });

  // ── FASE 2: ESTADO ANTES ──────────────────────────────────────────────
  console.log('\n━━━ FASE 2: Estado antes do fix ━━━\n');
  const [antes] = await sql`
    SELECT EXISTS (SELECT 1 FROM alissonerp.vw_ordens_prontas_volta WHERE id = 1707) AS aparece
  `;
  console.log(`Aparece em vw_ordens_prontas_volta: ${antes.aparece ? '✅ SIM' : '❌ NÃO'}`);

  // ── FASE 3: EXECUTAR CORREÇÕES ────────────────────────────────────────
  console.log('\n━━━ FASE 3: Aplicando correções ━━━\n');

  await sql.begin(async tx => {
    // 3.1. Marcar PCP 228 como concluído
    console.log('▶ UPDATE pcp #228 etapas → concluido');
    const upd = await tx`
      UPDATE alissonerp.pcp
         SET etapas = 'concluido',
             data_conclusao = NOW(),
             updated_at = NOW()
       WHERE id = 228
         AND etapas <> 'concluido'
      RETURNING id, etapas
    `;
    console.log(`  → ${upd.count} linha(s) atualizada(s)`);

    // 3.2. Criar auditoria de fábrica aprovada
    console.log('\n▶ INSERT alissonerp.auditorias (tipo_auditoria=fabrica, situacao=aprovado)');
    // Verifica se já existe pra não duplicar
    const [jaExiste] = await tx`
      SELECT id FROM alissonerp.auditorias
      WHERE ordem_id = 1707 AND tipo_auditoria::text = 'fabrica' AND situacao::text = 'aprovado'
      LIMIT 1
    `;
    if (jaExiste) {
      console.log(`  → já existe auditoria #${jaExiste.id}, skip insert`);
    } else {
      const ins = await tx`
        INSERT INTO alissonerp.auditorias (ordem_id, tipo_auditoria, situacao, created_at, updated_at)
        VALUES (1707, 'fabrica', 'aprovado', NOW(), NOW())
        RETURNING id
      `;
      console.log(`  → criada auditoria #${ins[0].id}`);
    }
  });

  // ── FASE 4: VALIDAÇÃO ─────────────────────────────────────────────────
  console.log('\n━━━ FASE 4: Validação pós-fix ━━━\n');

  const [depois] = await sql`
    SELECT * FROM alissonerp.vw_ordens_prontas_volta WHERE id = 1707
  `;
  if (depois) {
    console.log(`✅ Aparece em vw_ordens_prontas_volta: ${JSON.stringify(depois)}`);
  } else {
    console.log('❌ AINDA não aparece — investigar mais');
  }

  // Re-check das flags
  const [o] = await sql`SELECT status::text AS st, tipo_ordem::text AS tp FROM alissonerp.ordens WHERE id = 1707`;
  console.log(`\nOrdem após fix: status=${o.st} | tipo=${o.tp}`);

  const pcps = await sql`SELECT id, etapas::text AS etapas FROM alissonerp.pcp WHERE ordem_id = 1707 ORDER BY id`;
  console.log('PCPs após fix:');
  pcps.forEach(p => console.log(`  #${p.id}: ${p.etapas}`));

  const auds = await sql`SELECT id, tipo_auditoria::text AS tipo, situacao::text AS sit FROM alissonerp.auditorias WHERE ordem_id = 1707 ORDER BY id`;
  console.log('Auditorias após fix:');
  auds.forEach(a => console.log(`  #${a.id}: ${a.tipo} / ${a.sit}`));

  // Simula o filtro da API: tipo_protocolo=service
  console.log('\n━━━ Simulação API /api/protocolo/ordens?direcao=volta&tipo_protocolo=service ━━━');
  const apiResult = await sql`
    SELECT v.id, v.numero_ordem, v.status::text AS status, o.tipo_ordem::text AS tipo_ordem
    FROM alissonerp.vw_ordens_prontas_volta v
    JOIN alissonerp.ordens o ON o.id = v.id
    WHERE o.tipo_ordem::text = ANY(ARRAY['servico_venda','garantia','servico_interno'])
      AND v.id = 1707
  `;
  if (apiResult.length > 0) {
    console.log(`✅ Aparece na tela de Protocolo Volta tipo Service:`);
    console.log(`   ${JSON.stringify(apiResult[0])}`);
  } else {
    console.log('❌ NÃO aparece na tela de Protocolo Volta tipo Service');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('FIX CONCLUÍDO ✅');
  console.log('═══════════════════════════════════════════════════════════');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
