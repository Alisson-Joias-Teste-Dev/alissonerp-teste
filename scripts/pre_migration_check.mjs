// Agente A — Pre-migration checks (10 passos obrigatórios)
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== PRE-MIGRATION CHECK — 10 PASSOS ===\n');

try {
  // PASSO 3 — Colunas de alissonerp.ordens
  console.log('── PASSO 3: Colunas de alissonerp.ordens ──');
  const colsOrdens = await sql`
    SELECT column_name, data_type, column_default, is_nullable, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens'
    ORDER BY ordinal_position
  `;
  for (const c of colsOrdens) {
    console.log(`  ${c.column_name.padEnd(35)} ${c.udt_name.padEnd(30)} nullable=${c.is_nullable} default=${c.column_default ?? 'NULL'}`);
  }

  // PASSO 4 — Colunas de directus.ordens
  console.log('\n── PASSO 4: Colunas de directus.ordens ──');
  const colsDirectus = await sql`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'directus' AND table_name = 'ordens'
    ORDER BY ordinal_position
  `;
  for (const c of colsDirectus) {
    console.log(`  ${c.column_name.padEnd(40)} ${c.udt_name.padEnd(25)} nullable=${c.is_nullable}`);
  }

  // PASSO 5 — Triggers em alissonerp.ordens
  console.log('\n── PASSO 5: Triggers em alissonerp.ordens ──');
  const triggers = await sql`
    SELECT trigger_name, event_manipulation, action_timing, action_statement
    FROM information_schema.triggers
    WHERE event_object_schema = 'alissonerp' AND event_object_table = 'ordens'
    ORDER BY trigger_name
  `;
  if (triggers.length === 0) {
    console.log('  (nenhum trigger em alissonerp.ordens)');
  }
  for (const t of triggers) {
    console.log(`  ${t.trigger_name} | ${t.event_manipulation} | ${t.action_timing}`);
    console.log(`    ${t.action_statement}`);
  }

  // PASSO 6 — Código da função ponte
  console.log('\n── PASSO 6: Função ponte (fn_ponte_directus_para_alissonerp) ──');
  const fnPonte = await sql`
    SELECT proname, prosrc
    FROM pg_proc
    WHERE proname LIKE '%ponte%'
    ORDER BY proname
  `;
  if (fnPonte.length === 0) {
    console.log('  Não encontrada com nome *ponte* — buscando por conteúdo...');
    const fnByContent = await sql`
      SELECT proname, LEFT(prosrc, 3000) AS prosrc_trunc
      FROM pg_proc
      WHERE prosrc ILIKE '%alissonerp.ordens%INSERT%'
      AND prosrc ILIKE '%directus%'
      ORDER BY proname
    `;
    for (const f of fnByContent) {
      console.log(`\n  FUNÇÃO: ${f.proname}`);
      console.log(f.prosrc_trunc);
    }
  } else {
    for (const f of fnPonte) {
      console.log(`\n  FUNÇÃO: ${f.proname}`);
      console.log(f.prosrc);
    }
  }

  // PASSO 7 — Contar ordens ativas no Directus
  console.log('\n── PASSO 7: Ordens ativas no Directus (situacao=\'2\') ──');
  const countDirectus = await sql`
    SELECT COUNT(*)::int AS total FROM directus.ordens WHERE situacao = '2'
  `;
  console.log(`  Total ordens situacao='2': ${countDirectus[0].total}`);

  const countAll = await sql`
    SELECT situacao, COUNT(*)::int AS total FROM directus.ordens GROUP BY situacao ORDER BY situacao
  `;
  console.log('  Por situacao:');
  for (const r of countAll) {
    const label = r.situacao === '1' ? '(Cancelado)' : r.situacao === '2' ? '(Criado/Ativo)' : r.situacao === '3' ? '(Rascunho)' : '';
    console.log(`    situacao=${r.situacao} ${label} → ${r.total}`);
  }

  // PASSO 8 — Sequence de alissonerp.ordens
  console.log('\n── PASSO 8: Sequence de alissonerp.ordens ──');
  const seqName = await sql`SELECT pg_get_serial_sequence('alissonerp.ordens', 'id') AS seq`;
  console.log(`  Sequence: ${seqName[0].seq}`);

  // PASSO 9 — Buckets
  console.log('\n── PASSO 9: Storage buckets ──');
  const buckets = await sql`SELECT id, name, public FROM storage.buckets ORDER BY name`;
  for (const b of buckets) {
    console.log(`  [${b.id}] name="${b.name}" public=${b.public}`);
  }

  // PASSO 10 — Tabelas transacionais
  console.log('\n── PASSO 10: Tabelas transacionais (existência + contagem atual) ──');
  const tabCheck = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp'
    AND table_name IN (
      'ordens','pcp','saidas_ordem','apontamentos_pcp','distribuicoes',
      'distribuicao_ordens','distribuicao_saida_pedras','transferencias_ordem',
      'protocolos','protocolo_ordens','protocolo_fotos','auditorias',
      'quebra_operador','movimentacoes_estoque','controle_estoque',
      'comentarios_ordem','notificacoes','markup_alteracoes'
    )
    ORDER BY table_name
  `;
  console.log('  Existem:', tabCheck.map(t => t.table_name).join(', '));

  // Amostra do directus.ordens para ver valores reais
  console.log('\n── EXTRA: Amostra de 3 ordens directus ──');
  const sample = await sql`SELECT * FROM directus.ordens WHERE situacao = '2' LIMIT 3`;
  for (const r of sample) {
    console.log('  id=' + r.id + ' tipo_ordem=' + r.tipo_ordem + ' situacao=' + r.situacao +
      ' status=' + r.status + ' rota=' + r.rota + ' pedido_id=' + r.pedido_id +
      ' peso_metal_negocido=' + r.peso_metal_negocido + ' numero_ordem=' + r.numero_ordem);
  }

  // EXTRA: ENUMs disponíveis no alissonerp
  console.log('\n── EXTRA: ENUMs do schema alissonerp ──');
  const enums = await sql`
    SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS valores
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'alissonerp'
    GROUP BY t.typname
    ORDER BY t.typname
  `;
  for (const e of enums) {
    console.log(`  ${e.typname}: ${e.valores.join(', ')}`);
  }

  // Estado atual de alissonerp.ordens (deve estar vazio do reset anterior)
  console.log('\n── ESTADO ATUAL: alissonerp.ordens ──');
  const countAtual = await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ordens`;
  console.log(`  Total registros: ${countAtual[0].total} (esperado: 0 após reset)`);

} catch (err) {
  console.error('ERRO:', err.message);
  console.error(err.stack);
} finally {
  await sql.end();
}
