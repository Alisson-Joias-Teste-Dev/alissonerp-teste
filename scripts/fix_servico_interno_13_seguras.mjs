import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== FIX: 13 ordens servico_interno com PCP vazio → migrar pra rota=protocolo ===\n');

try {
  // Re-identifica as seguras dentro de transação (evita drift)
  const result = await sql.begin(async (tx) => {
    const candidatas = await tx`
      SELECT o.id, o.numero_ordem
      FROM alissonerp.ordens o
      WHERE o.tipo_ordem::text = 'servico_interno'
        AND o.rota::text = 'pcp'
        AND o.status::text NOT IN ('cancelado','entregue','concluido')
        AND NOT EXISTS (SELECT 1 FROM alissonerp.movimentacoes_estoque m WHERE m.ordem_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM alissonerp.apontamentos_pcp ap
                        JOIN alissonerp.pcp p ON p.id = ap.pcp_id
                        WHERE p.ordem_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM alissonerp.protocolo_ordens po
                        JOIN alissonerp.protocolos pr ON pr.id = po.protocolo_id
                        WHERE po.ordem_id = o.id AND pr.direcao='ida')
      ORDER BY o.id
    `;

    console.log(`Candidatas seguras encontradas: ${candidatas.length}`);
    if (candidatas.length === 0) return { deletedPcp: 0, updatedOrdens: 0, ids: [] };

    const ids = candidatas.map(o => o.id);

    // 0. Deletar serviços fantasma criados pelo trigger (todos 'aguardando', operador NULL)
    //    Guarda: só deletar serviços sem qualquer vestígio de trabalho
    const servicosDeleted = await tx`
      DELETE FROM alissonerp.servicos s
      USING alissonerp.pcp p, alissonerp.ordens o
      WHERE s.pcp_id = p.id
        AND p.ordem_id = o.id
        AND o.id = ANY(${ids}::bigint[])
        AND s.status::text = 'aguardando'
        AND s.operador_id IS NULL
        AND s.peso_saida IS NULL
        AND s.concluido_em IS NULL
        AND s.foto_recebimento IS NULL
      RETURNING s.id AS servico_id, p.ordem_id
    `;
    console.log(`Serviços fantasma deletados: ${servicosDeleted.length}`);

    // 1. Deletar PCP órfãos dessas ordens
    const pcpDeleted = await tx`
      DELETE FROM alissonerp.pcp
      WHERE ordem_id = ANY(${ids}::bigint[])
      RETURNING id, ordem_id
    `;
    console.log(`PCPs deletados: ${pcpDeleted.length}`);

    // 2. Atualizar rota
    const ordensUpdated = await tx`
      UPDATE alissonerp.ordens
      SET rota = 'protocolo'::alissonerp.enum_rota_ordem
      WHERE id = ANY(${ids}::bigint[])
      RETURNING id, numero_ordem, rota::text AS rota
    `;

    return { deletedPcp: pcpDeleted.length, updatedOrdens: ordensUpdated, ids };
  });

  console.log(`\n✅ PCPs deletados: ${result.deletedPcp}`);
  console.log(`✅ Ordens atualizadas para rota=protocolo:`);
  console.table(result.updatedOrdens);

  // 3. Verificar aparição na view e validar
  const naView = await sql`
    SELECT v.id, v.numero_ordem
    FROM alissonerp.vw_ordens_prontas_ida v
    JOIN alissonerp.ordens o ON o.id = v.id
    WHERE o.tipo_ordem::text = 'servico_interno'
    ORDER BY v.id DESC
  `;
  console.log(`\n✅ Agora ${naView.length} servico_interno aparecem em vw_ordens_prontas_ida:`);
  console.table(naView);

  console.log('\n=== CONCLUÍDO — essas ordens já podem ser adicionadas a um protocolo service ✅ ===');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
