import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== BACKFILL: servico_interno com rota=pcp ===\n');

try {
  // 1. Listar candidatas + sinalizar quais têm PCP / movimentações / apontamentos
  const candidatas = await sql`
    SELECT
      o.id, o.numero_ordem, o.status::text AS status, o.created_at::date AS criada,
      EXISTS(SELECT 1 FROM alissonerp.pcp p WHERE p.ordem_id = o.id) AS tem_pcp,
      EXISTS(SELECT 1 FROM alissonerp.movimentacoes_estoque m WHERE m.ordem_id = o.id) AS tem_movimentacao,
      EXISTS(SELECT 1 FROM alissonerp.apontamentos_pcp ap
             JOIN alissonerp.pcp p ON p.id = ap.pcp_id
             WHERE p.ordem_id = o.id) AS tem_apontamento,
      EXISTS(SELECT 1 FROM alissonerp.protocolo_ordens po
             JOIN alissonerp.protocolos pr ON pr.id = po.protocolo_id
             WHERE po.ordem_id = o.id AND pr.direcao='ida') AS ja_teve_protocolo
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem::text = 'servico_interno'
      AND o.rota::text = 'pcp'
      AND o.status::text NOT IN ('cancelado','entregue','concluido')
    ORDER BY o.id
  `;

  console.log(`Total candidatas: ${candidatas.length}\n`);

  const seguras = [];
  const bloqueadas = [];
  for (const o of candidatas) {
    if (o.tem_pcp || o.tem_movimentacao || o.tem_apontamento || o.ja_teve_protocolo) {
      bloqueadas.push(o);
    } else {
      seguras.push(o);
    }
  }

  console.log(`✅ Seguras (sem PCP/movimentação/apontamento/protocolo): ${seguras.length}`);
  console.table(seguras.map(o => ({ id: o.id, numero: o.numero_ordem, status: o.status, criada: o.criada })));

  console.log(`\n⚠️  Bloqueadas (já têm vínculo PCP — NÃO atualizar): ${bloqueadas.length}`);
  console.table(bloqueadas.map(o => ({
    id: o.id, numero: o.numero_ordem, status: o.status,
    pcp: o.tem_pcp, mov: o.tem_movimentacao, apont: o.tem_apontamento, prot_ida: o.ja_teve_protocolo
  })));

  if (seguras.length > 0) {
    const ids = seguras.map(o => o.id);
    const updated = await sql`
      UPDATE alissonerp.ordens
      SET rota = 'protocolo'::alissonerp.rota_ordem
      WHERE id = ANY(${ids}::bigint[])
      RETURNING id, numero_ordem
    `;
    console.log(`\n✅ Atualizadas: ${updated.length}`);
    console.table(updated);

    const confirmacao = await sql`
      SELECT rota::text AS rota, COUNT(*)::int AS n
      FROM alissonerp.ordens
      WHERE tipo_ordem::text='servico_interno'
      GROUP BY rota::text ORDER BY n DESC
    `;
    console.log('\n=== Distribuição rota final ===');
    console.log(confirmacao);
  } else {
    console.log('\nNada a atualizar.');
  }

  console.log('\n=== BACKFILL CONCLUÍDO ✅ ===');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
