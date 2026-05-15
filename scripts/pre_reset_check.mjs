// Agente A — Pre-reset checks
// Verifica tabelas, sequences, buckets e contagens ANTES do reset
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== PRE-RESET CHECK — Alisson ERP Go-Live ===\n');

try {
  // 1. Confirmar tabelas transacionais existem
  console.log('── 1. TABELAS TRANSACIONAIS ──');
  const tabelas = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'alissonerp'
    AND table_name IN (
      'ordens','pcp','saidas_ordem','apontamentos_pcp','distribuicoes',
      'distribuicao_ordens','distribuicao_saida_pedras','transferencias_ordem',
      'protocolos','protocolo_ordens','protocolo_fotos',
      'auditorias','quebra_operador','movimentacoes_estoque','controle_estoque',
      'comentarios_ordem','notificacoes','markup_alteracoes'
    )
    ORDER BY table_name
  `;
  console.log('Encontradas:', tabelas.map(t => t.table_name).join(', '));

  const tabelasEncontradas = new Set(tabelas.map(t => t.table_name));
  const tabelasEsperadas = [
    'ordens','pcp','saidas_ordem','apontamentos_pcp','distribuicoes',
    'distribuicao_ordens','distribuicao_saida_pedras','transferencias_ordem',
    'protocolos','protocolo_ordens','protocolo_fotos',
    'auditorias','quebra_operador','movimentacoes_estoque','controle_estoque',
    'comentarios_ordem','notificacoes','markup_alteracoes'
  ];
  const faltando = tabelasEsperadas.filter(t => !tabelasEncontradas.has(t));
  if (faltando.length > 0) {
    console.log('⚠️  FALTANDO:', faltando.join(', '));
  } else {
    console.log('✅ Todas as tabelas transacionais existem');
  }

  // 2. Confirmar tabelas de cadastro (NÃO serão zeradas)
  console.log('\n── 2. TABELAS CADASTRO (preservar) ──');
  const cadastros = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'alissonerp'
    AND table_name IN (
      'insumos','categorias_insumo','depositos','setores','tipos_apontamento',
      'usuarios','roles','role_permissoes','produto_composicao',
      'markup_pedras','configuracoes_sistema'
    )
    ORDER BY table_name
  `;
  console.log('Encontradas:', cadastros.map(t => t.table_name).join(', '));

  // 3. Contagens ANTES do reset
  console.log('\n── 3. CONTAGENS ATUAIS (transacionais) ──');
  const contagens = await sql`
    SELECT 'ordens' AS tabela, COUNT(*)::int AS total FROM alissonerp.ordens
    UNION ALL SELECT 'pcp', COUNT(*)::int FROM alissonerp.pcp
    UNION ALL SELECT 'saidas_ordem', COUNT(*)::int FROM alissonerp.saidas_ordem
    UNION ALL SELECT 'apontamentos_pcp', COUNT(*)::int FROM alissonerp.apontamentos_pcp
    UNION ALL SELECT 'distribuicoes', COUNT(*)::int FROM alissonerp.distribuicoes
    UNION ALL SELECT 'distribuicao_ordens', COUNT(*)::int FROM alissonerp.distribuicao_ordens
    UNION ALL SELECT 'transferencias_ordem', COUNT(*)::int FROM alissonerp.transferencias_ordem
    UNION ALL SELECT 'protocolos', COUNT(*)::int FROM alissonerp.protocolos
    UNION ALL SELECT 'protocolo_ordens', COUNT(*)::int FROM alissonerp.protocolo_ordens
    UNION ALL SELECT 'protocolo_fotos', COUNT(*)::int FROM alissonerp.protocolo_fotos
    UNION ALL SELECT 'auditorias', COUNT(*)::int FROM alissonerp.auditorias
    UNION ALL SELECT 'quebra_operador', COUNT(*)::int FROM alissonerp.quebra_operador
    UNION ALL SELECT 'movimentacoes_estoque', COUNT(*)::int FROM alissonerp.movimentacoes_estoque
    UNION ALL SELECT 'comentarios_ordem', COUNT(*)::int FROM alissonerp.comentarios_ordem
    UNION ALL SELECT 'notificacoes', COUNT(*)::int FROM alissonerp.notificacoes
    UNION ALL SELECT 'markup_alteracoes', COUNT(*)::int FROM alissonerp.markup_alteracoes
  `;
  for (const r of contagens) {
    console.log(`  ${r.tabela.padEnd(30)} = ${r.total}`);
  }

  // 4. Contagens cadastro
  console.log('\n── 4. CONTAGENS CADASTRO (deve manter) ──');
  const contCadastro = await sql`
    SELECT 'insumos' AS tabela, COUNT(*)::int AS total FROM alissonerp.insumos
    UNION ALL SELECT 'categorias_insumo', COUNT(*)::int FROM alissonerp.categorias_insumo
    UNION ALL SELECT 'depositos', COUNT(*)::int FROM alissonerp.depositos
    UNION ALL SELECT 'setores', COUNT(*)::int FROM alissonerp.setores
    UNION ALL SELECT 'tipos_apontamento', COUNT(*)::int FROM alissonerp.tipos_apontamento
    UNION ALL SELECT 'configuracoes_sistema', COUNT(*)::int FROM alissonerp.configuracoes_sistema
  `;
  for (const r of contCadastro) {
    console.log(`  ${r.tabela.padEnd(30)} = ${r.total}`);
  }

  // 5. Sequences
  console.log('\n── 5. SEQUENCES ──');
  const sequences = await sql`
    SELECT sequencename AS sequence_name, last_value
    FROM pg_sequences
    WHERE schemaname = 'alissonerp'
    ORDER BY sequencename
  `;
  for (const s of sequences) {
    console.log(`  ${s.sequence_name.padEnd(50)} last_value = ${s.last_value}`);
  }

  // 6. Buckets Storage
  console.log('\n── 6. STORAGE BUCKETS ──');
  const buckets = await sql`
    SELECT id, name, public, file_size_limit
    FROM storage.buckets
    ORDER BY name
  `;
  for (const b of buckets) {
    console.log(`  [${b.id}] name="${b.name}" public=${b.public}`);
  }

  // 7. Contagem de arquivos por bucket
  console.log('\n── 7. ARQUIVOS NOS BUCKETS (amostra) ──');
  const arquivos = await sql`
    SELECT bucket_id, COUNT(*)::int AS total
    FROM storage.objects
    GROUP BY bucket_id
    ORDER BY bucket_id
  `;
  for (const a of arquivos) {
    console.log(`  bucket_id="${a.bucket_id}" → ${a.total} arquivo(s)`);
  }
  if (arquivos.length === 0) console.log('  (nenhum arquivo nos buckets)');

  // 8. Verificar backup_mov_pedras se existir
  console.log('\n── 8. TABELA LEGADA backup_mov_pedras ──');
  const bmpCheck = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp' AND table_name LIKE 'backup_mov_pedras%'
  `;
  if (bmpCheck.length > 0) {
    console.log('  Encontrada:', bmpCheck.map(t => t.table_name).join(', '));
  } else {
    console.log('  Não existe (ok)');
  }

  console.log('\n=== CHECK CONCLUÍDO ===');

} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await sql.end();
}
