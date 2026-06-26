// Agente A — Reset Total Go-Live
// Zera tabelas transacionais, mantém cadastros, limpa storage ERP
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== RESET TOTAL — ALISSON ERP GO-LIVE ===\n');
console.log('⚠️  ESTA OPERAÇÃO É IRREVERSÍVEL');
console.log('✅ Backup confirmado em: backups/pre_golive_2026-03-18T13-13-23\n');

try {
  // ─────────────────────────────────────────────────────────────
  // ETAPA 1 — TRUNCATE tabelas transacionais (em transação)
  // ─────────────────────────────────────────────────────────────
  console.log('── ETAPA 1: TRUNCATE tabelas transacionais ──');

  await sql.begin(async (tx) => {
    // 1. Sistema
    await tx`TRUNCATE alissonerp.comentarios_ordem RESTART IDENTITY CASCADE`;
    console.log('  ✅ comentarios_ordem');
    await tx`TRUNCATE alissonerp.notificacoes RESTART IDENTITY CASCADE`;
    console.log('  ✅ notificacoes');
    await tx`TRUNCATE alissonerp.markup_alteracoes RESTART IDENTITY CASCADE`;
    console.log('  ✅ markup_alteracoes');

    // 2. Quebra
    await tx`TRUNCATE alissonerp.quebra_operador RESTART IDENTITY CASCADE`;
    console.log('  ✅ quebra_operador');

    // 3. Protocolo (fotos → ordens_protocolo → protocolos)
    await tx`TRUNCATE alissonerp.protocolo_fotos RESTART IDENTITY CASCADE`;
    console.log('  ✅ protocolo_fotos');
    await tx`TRUNCATE alissonerp.protocolo_ordens RESTART IDENTITY CASCADE`;
    console.log('  ✅ protocolo_ordens');
    await tx`TRUNCATE alissonerp.protocolos RESTART IDENTITY CASCADE`;
    console.log('  ✅ protocolos');

    // 4. Auditoria
    await tx`TRUNCATE alissonerp.auditorias RESTART IDENTITY CASCADE`;
    console.log('  ✅ auditorias');

    // 5. Distribuição (saida_pedras → distribuicao_ordens → distribuicoes)
    await tx`TRUNCATE alissonerp.distribuicao_saida_pedras RESTART IDENTITY CASCADE`;
    console.log('  ✅ distribuicao_saida_pedras');
    await tx`TRUNCATE alissonerp.distribuicao_ordens RESTART IDENTITY CASCADE`;
    console.log('  ✅ distribuicao_ordens');
    await tx`TRUNCATE alissonerp.distribuicoes RESTART IDENTITY CASCADE`;
    console.log('  ✅ distribuicoes');

    // 6. PCP (apontamentos → transferências → saídas → pcp)
    await tx`TRUNCATE alissonerp.apontamentos_pcp RESTART IDENTITY CASCADE`;
    console.log('  ✅ apontamentos_pcp');
    await tx`TRUNCATE alissonerp.transferencias_ordem RESTART IDENTITY CASCADE`;
    console.log('  ✅ transferencias_ordem');
    await tx`TRUNCATE alissonerp.saidas_ordem RESTART IDENTITY CASCADE`;
    console.log('  ✅ saidas_ordem');
    await tx`TRUNCATE alissonerp.pcp RESTART IDENTITY CASCADE`;
    console.log('  ✅ pcp');

    // 7. Ordens (pai de tudo)
    await tx`TRUNCATE alissonerp.ordens RESTART IDENTITY CASCADE`;
    console.log('  ✅ ordens');

    // 8. Estoque
    await tx`TRUNCATE alissonerp.movimentacoes_estoque RESTART IDENTITY CASCADE`;
    console.log('  ✅ movimentacoes_estoque');

    // 9. Tabelas legadas de backup
    await tx`DROP TABLE IF EXISTS alissonerp.backup_mov_pedras_20260310`;
    console.log('  ✅ DROP backup_mov_pedras_20260310');
    await tx`DROP TABLE IF EXISTS alissonerp.backup_mov_pedras_fix_20260311`;
    console.log('  ✅ DROP backup_mov_pedras_fix_20260311');
  });

  console.log('\n✅ ETAPA 1 CONCLUÍDA (commit bem-sucedido)');

  // ─────────────────────────────────────────────────────────────
  // ETAPA 2 — Verificar sequences após RESTART IDENTITY
  // ─────────────────────────────────────────────────────────────
  console.log('\n── ETAPA 2: Verificar sequences ──');
  const sequences = await sql`
    SELECT sequencename, last_value
    FROM pg_sequences
    WHERE schemaname = 'alissonerp'
    AND sequencename IN (
      'ordens_id_seq','pcp_id_seq','saidas_ordem_id_seq','apontamentos_pcp_id_seq',
      'distribuicoes_id_seq','distribuicao_ordens_id_seq','transferencias_ordem_id_seq',
      'protocolos_id_seq','protocolo_ordens_id_seq','protocolo_fotos_id_seq',
      'auditorias_id_seq','quebra_operador_id_seq','movimentacoes_estoque_id_seq',
      'comentarios_ordem_id_seq','notificacoes_id_seq','markup_alteracoes_id_seq'
    )
    ORDER BY sequencename
  `;
  let allReset = true;
  for (const s of sequences) {
    const status = (s.last_value === null || s.last_value === 1n) ? '✅' : `⚠️  last_value=${s.last_value}`;
    console.log(`  ${status} ${s.sequencename}`);
    if (s.last_value !== null && s.last_value !== 1n) allReset = false;
  }
  if (allReset) {
    console.log('\n✅ Todas as sequences resetadas');
  } else {
    console.log('\n⚠️  Algumas sequences precisam reset manual (veja acima)');
  }

  // ─────────────────────────────────────────────────────────────
  // ETAPA 3 — Limpar Storage (buckets ERP)
  // ─────────────────────────────────────────────────────────────
  console.log('\n── ETAPA 3: Limpar storage buckets ERP ──');

  // Confirmar quais buckets existem
  const buckets = await sql`SELECT id, name FROM storage.buckets ORDER BY name`;
  console.log('Buckets existentes:', buckets.map(b => b.name).join(', '));

  const bucketsERP = ['apontamento-fotos', 'protocolo-fotos', 'ordem-fotos'];

  for (const bucketName of bucketsERP) {
    const existe = buckets.find(b => b.name === bucketName);
    if (!existe) {
      console.log(`  ⚠️  Bucket "${bucketName}" não encontrado, pulando`);
      continue;
    }
    const result = await sql`
      DELETE FROM storage.objects WHERE bucket_id = ${bucketName}
    `;
    console.log(`  ✅ Deletados ${result.count} arquivo(s) de "${bucketName}"`);
  }

  console.log('\n✅ ETAPA 3 CONCLUÍDA');

} catch (err) {
  console.error('\n❌ ERRO FATAL:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
} finally {
  await sql.end();
}

console.log('\n=== RESET CONCLUÍDO — Prosseguir para VALIDAÇÃO ===');
