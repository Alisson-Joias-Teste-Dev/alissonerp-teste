// Agente A — Migração ordens Directus → alissonerp (origem='legado')
// Mapeamento baseado no código REAL de fn_ponte_directus_para_alissonerp
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== MIGRAÇÃO ORDENS LEGADO — Alisson ERP Go-Live ===\n');

try {
  // ─────────────────────────────────────────────────────────────
  // ETAPA 3 — ADD COLUMN origem
  // ─────────────────────────────────────────────────────────────
  console.log('── ETAPA 3: ADD COLUMN origem ──');

  // Verificar se coluna já existe
  const colExists = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens' AND column_name = 'origem'
  `;

  if (colExists.length > 0) {
    console.log('  ℹ️  Coluna origem já existe — pulando ADD COLUMN');
  } else {
    await sql`
      ALTER TABLE alissonerp.ordens
        ADD COLUMN origem VARCHAR(20) DEFAULT 'erp' NOT NULL
    `;
    await sql`
      COMMENT ON COLUMN alissonerp.ordens.origem IS
        'Origem da ordem: legado (importado do Directus) | erp (criado no novo sistema)'
    `;
    console.log('  ✅ Coluna origem adicionada (default=erp, NOT NULL)');
  }

  // Verificar
  const colCheck = await sql`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens' AND column_name = 'origem'
  `;
  console.log('  ✅ Confirmado:', JSON.stringify(colCheck[0]));

  // ─────────────────────────────────────────────────────────────
  // ETAPA 4 — MIGRAÇÃO
  // ─────────────────────────────────────────────────────────────

  // 4.1 — Desabilitar triggers de usuário (não triggers de sistema/FK)
  console.log('\n── ETAPA 4.1: Desabilitar triggers ──');
  // trg_audit_ordens: insere em audit_log a cada INSERT/UPDATE/DELETE → desnecessário na migração
  // trg_ordens_proteger_pdv: só age em UPDATE → não impacta INSERT, mas desabilitamos por precaução
  await sql`ALTER TABLE alissonerp.ordens DISABLE TRIGGER trg_audit_ordens`;
  console.log('  ✅ trg_audit_ordens desabilitado');
  await sql`ALTER TABLE alissonerp.ordens DISABLE TRIGGER trg_ordens_proteger_pdv`;
  console.log('  ✅ trg_ordens_proteger_pdv desabilitado');

  // 4.2 — Verificar estado antes
  const preCount = await sql`SELECT COUNT(*)::int AS total FROM alissonerp.ordens`;
  const directusCount = await sql`SELECT COUNT(*)::int AS total FROM directus.ordens WHERE situacao = '2'`;
  console.log(`\n  Antes: alissonerp.ordens = ${preCount[0].total}`);
  console.log(`  Directus situacao='2': ${directusCount[0].total} ordens para migrar`);

  // 4.3 — INSERT usando mapeamento EXATO da função ponte
  console.log('\n── ETAPA 4.3: INSERT migração ──');

  const resultado = await sql`
    INSERT INTO alissonerp.ordens (
      numero_ordem,
      cliente_id,
      vendedor_id,
      pedido_id,
      numero_pedido,
      tipo_ordem,
      data_entrega,
      peso_metal_negociado,
      peso_metal_externo,
      itens_para_fabricacao,
      situacao,
      status,
      rota,
      tipo_controle,
      setor_atual,
      local_atual,
      distribuicao_id,
      protocolo_loja,
      id_ordem_relacionada,
      id_asana,
      motivo_reprovacao,
      origem_reprovacao,
      data_conclusao,
      ficha_tecnica_id,
      directus_ordem_id,
      created_at,
      updated_at,
      eh_teste,
      origem
    )
    SELECT
      d.numero_ordem,
      d.cliente_id,
      d.vendedor_id,
      d.pedido_id,
      -- Lookup numero_pedido em public.vendas (migration 035/036)
      v.numero_pedido::text,
      -- Mapeamento EXATO da função ponte fn_ponte_directus_para_alissonerp
      CASE d.tipo_ordem
        WHEN '1' THEN 'servico'::alissonerp.enum_tipo_ordem
        WHEN '2' THEN 'fabricacao'::alissonerp.enum_tipo_ordem
        WHEN '3' THEN 'reposicao_venda'::alissonerp.enum_tipo_ordem
        WHEN '4' THEN 'reposicao_loja'::alissonerp.enum_tipo_ordem
        WHEN '5' THEN 'compra_fornecedor'::alissonerp.enum_tipo_ordem
        WHEN '6' THEN 'garantia'::alissonerp.enum_tipo_ordem
        WHEN '7' THEN 'servico_interno'::alissonerp.enum_tipo_ordem
        ELSE          'servico'::alissonerp.enum_tipo_ordem
      END,
      d.data_entrega,
      COALESCE(d.peso_metal_negocido, 0),
      COALESCE(d.peso_metal_externo, 0),
      d.itens_para_fabricacao,
      -- situacao: todas vêm com situacao='2' (Criado) → 'criado'
      'criado'::alissonerp.enum_situacao_ordem,
      -- status: mapeamento numérico → enum (igual à função ponte)
      CASE d.status
        WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
        WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
        WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
        ELSE          'aguardando'::alissonerp.enum_status_ordem
      END,
      -- rota: mapeamento EXATO da função ponte (migration 040)
      CASE
        WHEN d.tipo_ordem = '1' THEN 'protocolo'::alissonerp.enum_rota_ordem
        WHEN d.rota = '1'       THEN 'pcp'::alissonerp.enum_rota_ordem
        WHEN d.rota = '2'       THEN 'protocolo'::alissonerp.enum_rota_ordem
        ELSE NULL
      END,
      d.tipo_controle,
      d.setor_atual,
      -- local_atual: FK → alissonerp.depositos (IDs 1-8)
      -- Valores inválidos (ex: 10, que não existe) → NULL
      CASE WHEN d.local_atual::integer IN (SELECT id FROM alissonerp.depositos)
           THEN d.local_atual::integer
           ELSE NULL
      END,
      d.distribuicao_id,
      COALESCE(d.protocolo_loja::boolean, false),
      -- id_ordem_relacionada: FK self-ref em alissonerp.ordens.id
      -- Impossível resolver durante INSERT (ordens referenciadas ainda não existem)
      -- Será resolvida via UPDATE pós-migração usando directus_ordem_id como chave
      NULL::integer,
      d.id_asana,
      d.motivo_reprovacao,
      d.origem_reprovacao,
      d.data_conclusao,
      d.ficha_tecnica_id,
      d.id,
      COALESCE(d.date_created, now()),
      now(),
      false,
      'legado'
    FROM directus.ordens d
    LEFT JOIN public.vendas v ON v.id = d.pedido_id
    WHERE d.situacao = '2'
    ORDER BY d.id
  `;

  console.log(`  ✅ INSERT concluído: ${resultado.count} ordens migradas`);

  // 4.4 — Reabilitar triggers
  console.log('\n── ETAPA 4.4: Reabilitar triggers ──');
  await sql`ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_audit_ordens`;
  console.log('  ✅ trg_audit_ordens reabilitado');
  await sql`ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_ordens_proteger_pdv`;
  console.log('  ✅ trg_ordens_proteger_pdv reabilitado');

  // 4.5 — Acertar sequence
  console.log('\n── ETAPA 4.5: Acertar sequence ──');
  const seqResult = await sql`
    SELECT setval(
      pg_get_serial_sequence('alissonerp.ordens', 'id'),
      COALESCE((SELECT MAX(id) FROM alissonerp.ordens), 0) + 1,
      false
    ) AS novo_valor
  `;
  console.log(`  ✅ Sequence ajustada: próximo ID = ${seqResult[0].novo_valor}`);

} catch (err) {
  // Garantir que triggers sejam reabilitados mesmo em caso de erro
  try {
    await sql`ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_audit_ordens`;
    await sql`ALTER TABLE alissonerp.ordens ENABLE TRIGGER trg_ordens_proteger_pdv`;
    console.log('\n  ⚠️  Triggers reabilitados após erro');
  } catch (_) {}

  console.error('\n❌ ERRO FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await sql.end();
}

console.log('\n=== MIGRAÇÃO CONCLUÍDA — Prosseguir para VALIDAÇÃO ===');
