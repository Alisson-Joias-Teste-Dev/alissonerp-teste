// Agente A — Validação pós-reset go-live
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== VALIDAÇÃO PÓS-RESET — Alisson ERP Go-Live ===\n');

let erros = 0;

try {
  // 1. Tabelas transacionais devem ser 0
  console.log('── 1. TABELAS TRANSACIONAIS (esperado: 0) ──');
  const transacionais = await sql`
    SELECT 'ordens' AS tabela, COUNT(*)::int AS total FROM alissonerp.ordens
    UNION ALL SELECT 'pcp', COUNT(*)::int FROM alissonerp.pcp
    UNION ALL SELECT 'saidas_ordem', COUNT(*)::int FROM alissonerp.saidas_ordem
    UNION ALL SELECT 'apontamentos_pcp', COUNT(*)::int FROM alissonerp.apontamentos_pcp
    UNION ALL SELECT 'distribuicoes', COUNT(*)::int FROM alissonerp.distribuicoes
    UNION ALL SELECT 'distribuicao_ordens', COUNT(*)::int FROM alissonerp.distribuicao_ordens
    UNION ALL SELECT 'distribuicao_saida_pedras', COUNT(*)::int FROM alissonerp.distribuicao_saida_pedras
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
  for (const r of transacionais) {
    if (r.total === 0) {
      console.log(`  ✅ ${r.tabela.padEnd(35)} = 0`);
    } else {
      console.log(`  ❌ ${r.tabela.padEnd(35)} = ${r.total} (deveria ser 0!)`);
      erros++;
    }
  }

  // 2. Tabelas de cascata também zeradas
  console.log('\n── 2. TABELAS CASCATA (esperado: 0) ──');
  const cascata = await sql`
    SELECT 'apontamentos_distribuicao' AS tabela, COUNT(*)::int AS total FROM alissonerp.apontamentos_distribuicao
    UNION ALL SELECT 'itens_distribuicao', COUNT(*)::int FROM alissonerp.itens_distribuicao
    UNION ALL SELECT 'outros_insumos_distribuicao', COUNT(*)::int FROM alissonerp.outros_insumos_distribuicao
    UNION ALL SELECT 'fechamentos_distribuicao', COUNT(*)::int FROM alissonerp.fechamentos_distribuicao
    UNION ALL SELECT 'outros_insumos_pcp', COUNT(*)::int FROM alissonerp.outros_insumos_pcp
    UNION ALL SELECT 'itens_ordem_insumos', COUNT(*)::int FROM alissonerp.itens_ordem_insumos
    UNION ALL SELECT 'pedras_ordens', COUNT(*)::int FROM alissonerp.pedras_ordens
    UNION ALL SELECT 'aprovacoes_consultora', COUNT(*)::int FROM alissonerp.aprovacoes_consultora
    UNION ALL SELECT 'preparacoes_entrega', COUNT(*)::int FROM alissonerp.preparacoes_entrega
  `;
  for (const r of cascata) {
    if (r.total === 0) {
      console.log(`  ✅ ${r.tabela.padEnd(35)} = 0`);
    } else {
      console.log(`  ❌ ${r.tabela.padEnd(35)} = ${r.total} (deveria ser 0!)`);
      erros++;
    }
  }

  // 3. Cadastros INTACTOS
  console.log('\n── 3. CADASTROS INTACTOS ──');
  const cadastros = await sql`
    SELECT 'insumos' AS tabela, COUNT(*)::int AS total FROM alissonerp.insumos
    UNION ALL SELECT 'categorias_insumo', COUNT(*)::int FROM alissonerp.categorias_insumo
    UNION ALL SELECT 'depositos', COUNT(*)::int FROM alissonerp.depositos
    UNION ALL SELECT 'setores', COUNT(*)::int FROM alissonerp.setores
    UNION ALL SELECT 'tipos_apontamento', COUNT(*)::int FROM alissonerp.tipos_apontamento
    UNION ALL SELECT 'configuracoes_sistema', COUNT(*)::int FROM alissonerp.configuracoes_sistema
    UNION ALL SELECT 'markup_pedras', COUNT(*)::int FROM alissonerp.markup_pedras
    UNION ALL SELECT 'produto_composicao', COUNT(*)::int FROM alissonerp.produto_composicao
  `;
  const esperados = { insumos: 251, categorias_insumo: 8, depositos: 8, setores: 10, tipos_apontamento: 9, configuracoes_sistema: 9 };
  for (const r of cadastros) {
    const esperado = esperados[r.tabela];
    if (esperado !== undefined) {
      if (r.total === esperado) {
        console.log(`  ✅ ${r.tabela.padEnd(35)} = ${r.total} (esperado: ${esperado})`);
      } else {
        console.log(`  ❌ ${r.tabela.padEnd(35)} = ${r.total} (esperado: ${esperado}!)`);
        erros++;
      }
    } else {
      console.log(`  ℹ️  ${r.tabela.padEnd(35)} = ${r.total}`);
    }
  }

  // 4. Saldos do pote zerados
  console.log('\n── 4. SALDOS DO POTE (esperado: vazio ou 0) ──');
  try {
    const saldoPote = await sql`SELECT * FROM alissonerp.vw_saldo_pote`;
    if (saldoPote.length === 0) {
      console.log('  ✅ vw_saldo_pote = vazia');
    } else {
      const comSaldo = saldoPote.filter(r => parseFloat(r.saldo || r.quantidade || 0) !== 0);
      if (comSaldo.length === 0) {
        console.log(`  ✅ vw_saldo_pote = ${saldoPote.length} row(s), todos saldo=0`);
      } else {
        console.log(`  ⚠️  vw_saldo_pote tem ${comSaldo.length} row(s) com saldo != 0:`);
        comSaldo.slice(0, 5).forEach(r => console.log('    ', JSON.stringify(r)));
      }
    }
  } catch (e) { console.log('  ⚠️  vw_saldo_pote:', e.message); }

  try {
    const saldoOuro = await sql`SELECT * FROM alissonerp.vw_saldo_pote_ouro`;
    if (saldoOuro.length === 0) {
      console.log('  ✅ vw_saldo_pote_ouro = vazia');
    } else {
      console.log(`  ✅ vw_saldo_pote_ouro = ${saldoOuro.length} row(s):`);
      saldoOuro.forEach(r => console.log('    ', JSON.stringify(r)));
    }
  } catch (e) { console.log('  ⚠️  vw_saldo_pote_ouro:', e.message); }

  try {
    const ouroProducao = await sql`SELECT * FROM alissonerp.vw_ouro_em_producao`;
    if (ouroProducao.length === 0) {
      console.log('  ✅ vw_ouro_em_producao = vazia');
    } else {
      console.log(`  ✅ vw_ouro_em_producao = ${ouroProducao.length} row(s):`);
      ouroProducao.forEach(r => console.log('    ', JSON.stringify(r)));
    }
  } catch (e) { console.log('  ⚠️  vw_ouro_em_producao:', e.message); }

  // 5. Storage limpo
  console.log('\n── 5. STORAGE LIMPO (esperado: 0 para buckets ERP) ──');
  const storageCount = await sql`
    SELECT bucket_id, COUNT(*)::int AS total
    FROM storage.objects
    WHERE bucket_id IN ('apontamento-fotos', 'protocolo-fotos', 'ordem-fotos')
    GROUP BY bucket_id
  `;
  if (storageCount.length === 0) {
    console.log('  ✅ Buckets ERP completamente vazios');
  } else {
    for (const r of storageCount) {
      if (r.total === 0) {
        console.log(`  ✅ ${r.bucket_id} = 0`);
      } else {
        console.log(`  ❌ ${r.bucket_id} = ${r.total} arquivo(s) restantes!`);
        erros++;
      }
    }
  }

  // Storage preservado (avatars + imagens)
  const storagePreservado = await sql`
    SELECT bucket_id, COUNT(*)::int AS total
    FROM storage.objects
    WHERE bucket_id IN ('avatars', 'imagens')
    GROUP BY bucket_id
  `;
  for (const r of storagePreservado) {
    console.log(`  ✅ ${r.bucket_id} (preservado) = ${r.total} arquivo(s)`);
  }

  // 6. Tabelas legadas dropadas
  console.log('\n── 6. TABELAS LEGADAS DROPADAS ──');
  const legadas = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp' AND table_name LIKE 'backup_mov_pedras%'
  `;
  if (legadas.length === 0) {
    console.log('  ✅ Nenhuma tabela backup_mov_pedras* encontrada');
  } else {
    console.log('  ❌ Ainda existem:', legadas.map(t => t.table_name).join(', '));
    erros++;
  }

  // 7. Sequences resetadas
  console.log('\n── 7. SEQUENCES RESETADAS ──');
  const seqCheck = await sql`
    SELECT sequencename, last_value
    FROM pg_sequences
    WHERE schemaname = 'alissonerp'
    AND sequencename IN ('ordens_id_seq','protocolos_id_seq','pcp_id_seq','movimentacoes_estoque_id_seq')
    ORDER BY sequencename
  `;
  for (const s of seqCheck) {
    if (s.last_value === null || s.last_value === 1n) {
      console.log(`  ✅ ${s.sequencename} = null/1 (resetada)`);
    } else {
      console.log(`  ⚠️  ${s.sequencename} = ${s.last_value}`);
    }
  }

} catch (err) {
  console.error('ERRO:', err.message);
  erros++;
} finally {
  await sql.end();
}

console.log('\n════════════════════════════════════════════');
if (erros === 0) {
  console.log('✅ VALIDAÇÃO 100% OK — Base pronta para produção!');
} else {
  console.log(`❌ VALIDAÇÃO COM ${erros} ERRO(S) — Verificar itens acima`);
}
console.log('════════════════════════════════════════════');
