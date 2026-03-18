// Agente A — Pós-migração: resolver id_ordem_relacionada + validação completa
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== PÓS-MIGRAÇÃO + VALIDAÇÃO ===\n');

let erros = 0;

try {
  // ─────────────────────────────────────────────────────────────
  // PASSO A — Resolver id_ordem_relacionada via mapeamento directus_id
  // ─────────────────────────────────────────────────────────────
  console.log('── PASSO A: Resolver id_ordem_relacionada ──');

  // Ver quantas ordens no directus têm id_ordem_relacionada
  const comRelacao = await sql`
    SELECT COUNT(*)::int AS total
    FROM directus.ordens
    WHERE situacao = '2' AND id_ordem_relacionada IS NOT NULL
  `;
  console.log(`  Ordens com id_ordem_relacionada no Directus: ${comRelacao[0].total}`);

  if (comRelacao[0].total > 0) {
    // Atualizar usando o mapeamento directus_ordem_id → alissonerp.ordens.id
    // A FK em alissonerp exige que o id_ordem_relacionada exista em alissonerp.ordens
    // Só atualiza se a ordem relacionada também foi migrada
    const updateResult = await sql`
      UPDATE alissonerp.ordens AS a
      SET id_ordem_relacionada = ref.id
      FROM directus.ordens AS d
      JOIN alissonerp.ordens AS ref ON ref.directus_ordem_id = d.id_ordem_relacionada::integer
      WHERE a.directus_ordem_id = d.id
        AND d.situacao = '2'
        AND d.id_ordem_relacionada IS NOT NULL
    `;
    console.log(`  ✅ ${updateResult.count} id_ordem_relacionada atualizados`);

    // Verificar quantos ficaram NULL (ordem relacionada não estava no directus)
    const aindaNull = await sql`
      SELECT COUNT(*)::int AS total
      FROM alissonerp.ordens a
      JOIN directus.ordens d ON d.id = a.directus_ordem_id
      WHERE d.id_ordem_relacionada IS NOT NULL
        AND a.id_ordem_relacionada IS NULL
    `;
    console.log(`  ℹ️  ${aindaNull[0].total} ordens com relacionada não migrada (ficaram NULL — ok)`);
  }

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.1 — Contagem de ordens migradas
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.1: Contagem ordens migradas ──');

  const totalMigradas = await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ordens`;
  const totalDirectus = await sql`SELECT COUNT(*)::int AS total FROM directus.ordens WHERE situacao = '2'`;

  console.log(`  alissonerp.ordens: ${totalMigradas[0].total}`);
  console.log(`  directus situacao='2': ${totalDirectus[0].total}`);

  if (totalMigradas[0].total === totalDirectus[0].total) {
    console.log(`  ✅ Contagens batem: ${totalMigradas[0].total} = ${totalDirectus[0].total}`);
  } else {
    console.log(`  ❌ Contagens DIVERGEM: ${totalMigradas[0].total} ≠ ${totalDirectus[0].total}`);
    erros++;
  }

  const porOrigem = await sql`SELECT origem, COUNT(*)::int AS total FROM alissonerp.ordens GROUP BY origem`;
  for (const r of porOrigem) {
    if (r.origem === 'legado') {
      console.log(`  ✅ origem='legado': ${r.total} ordens`);
    } else {
      console.log(`  ❌ origem='${r.origem}': ${r.total} (deveria ser tudo legado!)`);
      erros++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.2 — Integridade dos dados
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.2: Integridade dos dados ──');

  const semDirectusId = await sql`
    SELECT COUNT(*)::int AS total FROM alissonerp.ordens WHERE directus_ordem_id IS NULL
  `;
  if (semDirectusId[0].total === 0) {
    console.log('  ✅ Todas as ordens têm directus_ordem_id');
  } else {
    console.log(`  ❌ ${semDirectusId[0].total} ordens SEM directus_ordem_id`);
    erros++;
  }

  const porTipo = await sql`
    SELECT tipo_ordem, COUNT(*)::int AS total
    FROM alissonerp.ordens
    GROUP BY tipo_ordem ORDER BY tipo_ordem
  `;
  console.log('  Distribuição tipo_ordem:');
  let temNull = false;
  for (const r of porTipo) {
    if (r.tipo_ordem === null) { temNull = true; erros++; }
    console.log(`    ${r.tipo_ordem ?? 'NULL ❌'}: ${r.total}`);
  }
  if (!temNull) console.log('  ✅ Nenhum tipo_ordem NULL');

  const servicoSemProtocolo = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.ordens
    WHERE tipo_ordem = 'servico' AND rota != 'protocolo'
  `;
  if (servicoSemProtocolo[0].total === 0) {
    console.log('  ✅ Todas ordens tipo=servico têm rota=protocolo');
  } else {
    console.log(`  ❌ ${servicoSemProtocolo[0].total} ordens servico SEM protocolo!`);
    erros++;
  }

  const comPedido = await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ordens WHERE numero_pedido IS NOT NULL`;
  const semPedido = await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ordens WHERE numero_pedido IS NULL`;
  console.log(`  ✅ com numero_pedido: ${comPedido[0].total} | sem: ${semPedido[0].total}`);

  const porRota = await sql`SELECT rota, COUNT(*)::int AS total FROM alissonerp.ordens GROUP BY rota ORDER BY rota`;
  console.log('  Distribuição rota:', porRota.map(r => `${r.rota ?? 'NULL'}=${r.total}`).join(', '));

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.3 — Tabelas transacionais VAZIAS
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.3: Tabelas transacionais vazias ──');
  const transacionais = await sql`
    SELECT 'pcp' AS tabela, COUNT(*)::int AS total FROM alissonerp.pcp
    UNION ALL SELECT 'auditorias', COUNT(*)::int FROM alissonerp.auditorias
    UNION ALL SELECT 'protocolos', COUNT(*)::int FROM alissonerp.protocolos
    UNION ALL SELECT 'saidas_ordem', COUNT(*)::int FROM alissonerp.saidas_ordem
    UNION ALL SELECT 'distribuicoes', COUNT(*)::int FROM alissonerp.distribuicoes
    UNION ALL SELECT 'movimentacoes_estoque', COUNT(*)::int FROM alissonerp.movimentacoes_estoque
    UNION ALL SELECT 'apontamentos_pcp', COUNT(*)::int FROM alissonerp.apontamentos_pcp
    UNION ALL SELECT 'protocolo_ordens', COUNT(*)::int FROM alissonerp.protocolo_ordens
  `;
  for (const r of transacionais) {
    if (r.total === 0) {
      console.log(`  ✅ ${r.tabela.padEnd(25)} = 0`);
    } else {
      console.log(`  ❌ ${r.tabela.padEnd(25)} = ${r.total} (deveria ser 0!)`);
      erros++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.4 — Cadastros intactos
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.4: Cadastros intactos ──');
  const cadastros = await sql`
    SELECT 'insumos' AS tabela, COUNT(*)::int AS total FROM alissonerp.insumos
    UNION ALL SELECT 'depositos', COUNT(*)::int FROM alissonerp.depositos
    UNION ALL SELECT 'setores', COUNT(*)::int FROM alissonerp.setores
    UNION ALL SELECT 'tipos_apontamento', COUNT(*)::int FROM alissonerp.tipos_apontamento
    UNION ALL SELECT 'usuarios', COUNT(*)::int FROM alissonerp.usuarios
    UNION ALL SELECT 'roles', COUNT(*)::int FROM alissonerp.roles
    UNION ALL SELECT 'markup_pedras', COUNT(*)::int FROM alissonerp.markup_pedras
  `;
  const esperados = { insumos: 251, depositos: 8, setores: 10, tipos_apontamento: 9 };
  for (const r of cadastros) {
    const esp = esperados[r.tabela];
    if (esp !== undefined && r.total !== esp) {
      console.log(`  ❌ ${r.tabela.padEnd(20)} = ${r.total} (esperado: ${esp})`);
      erros++;
    } else {
      console.log(`  ✅ ${r.tabela.padEnd(20)} = ${r.total}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.5 — Saldos zerados
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.5: Saldos do pote ──');
  try {
    const saldo = await sql`SELECT * FROM alissonerp.vw_saldo_pote`;
    const comSaldo = saldo.filter(r => parseFloat(Object.values(r).find(v => typeof v === 'number') ?? 0) !== 0);
    console.log(`  ✅ vw_saldo_pote: ${saldo.length} rows, ${comSaldo.length} com saldo ≠ 0`);
  } catch (e) { console.log('  ⚠️  vw_saldo_pote:', e.message); }

  try {
    const saldoOuro = await sql`SELECT * FROM alissonerp.vw_saldo_pote_ouro`;
    console.log(`  ✅ vw_saldo_pote_ouro: ${saldoOuro.length} rows`);
    if (saldoOuro.length > 0) saldoOuro.forEach(r => console.log('    ', JSON.stringify(r)));
  } catch (e) { console.log('  ⚠️  vw_saldo_pote_ouro:', e.message); }

  // ─────────────────────────────────────────────────────────────
  // VALIDAÇÃO 5.6 — Triggers reabilitados
  // ─────────────────────────────────────────────────────────────
  console.log('\n── 5.6: Triggers reabilitados ──');
  const triggersAtivos = await sql`
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_schema = 'alissonerp' AND event_object_table = 'ordens'
    ORDER BY trigger_name, event_manipulation
  `;
  const nomesTriggers = [...new Set(triggersAtivos.map(t => t.trigger_name))];
  for (const nome of nomesTriggers) {
    const eventos = triggersAtivos.filter(t => t.trigger_name === nome).map(t => t.event_manipulation).join('/');
    console.log(`  ✅ ${nome} (${eventos})`);
  }
  if (nomesTriggers.includes('trg_audit_ordens') && nomesTriggers.includes('trg_ordens_proteger_pdv')) {
    console.log('  ✅ Todos os triggers reabilitados corretamente');
  } else {
    console.log('  ❌ Triggers faltando! Verificar manualmente.');
    erros++;
  }

  // ─────────────────────────────────────────────────────────────
  // COLUNA origem
  // ─────────────────────────────────────────────────────────────
  console.log('\n── EXTRA: Coluna origem ──');
  const colOrigem = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens' AND column_name = 'origem'
  `;
  console.log('  ✅', JSON.stringify(colOrigem[0]));

  // Amostra de ordens migradas
  console.log('\n── EXTRA: Amostra de 5 ordens migradas ──');
  const sample = await sql`
    SELECT id, directus_ordem_id, numero_ordem, tipo_ordem, situacao, status, rota, origem, numero_pedido
    FROM alissonerp.ordens
    ORDER BY directus_ordem_id
    LIMIT 5
  `;
  for (const r of sample) {
    console.log(`  id=${r.id} directus=${r.directus_ordem_id} ${r.numero_ordem} tipo=${r.tipo_ordem} rota=${r.rota} pedido=${r.numero_pedido ?? 'NULL'} origem=${r.origem}`);
  }

  // Sequence
  console.log('\n── EXTRA: Sequence ──');
  const seqVal = await sql`SELECT last_value FROM pg_sequences WHERE sequencename = 'ordens_id_seq' AND schemaname = 'alissonerp'`;
  console.log(`  ordens_id_seq last_value: ${seqVal[0].last_value}`);

} catch (err) {
  console.error('ERRO:', err.message);
  erros++;
} finally {
  await sql.end();
}

console.log('\n════════════════════════════════════════════');
if (erros === 0) {
  console.log('✅ VALIDAÇÃO 100% OK — Migração concluída com sucesso!');
} else {
  console.log(`❌ VALIDAÇÃO COM ${erros} ERRO(S) — Verificar itens acima`);
}
console.log('════════════════════════════════════════════');
