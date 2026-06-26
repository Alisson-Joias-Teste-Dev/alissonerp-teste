import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  console.log('=== Últimas 10 servico_interno: rota, status, auditoria loja? ===');
  console.log(await sql`
    SELECT o.id, o.numero_ordem, o.rota::text AS rota, o.status::text AS status,
           EXISTS(SELECT 1 FROM alissonerp.auditorias a
                  WHERE a.ordem_id=o.id AND a.tipo_auditoria::text='loja' AND a.situacao::text='aprovado') AS tem_aud_loja_aprov,
           EXISTS(SELECT 1 FROM alissonerp.protocolo_ordens po
                  JOIN alissonerp.protocolos p ON p.id=po.protocolo_id
                  WHERE po.ordem_id=o.id AND p.direcao='ida') AS ja_teve_protocolo_ida
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem::text='servico_interno'
    ORDER BY o.id DESC LIMIT 10
  `);

  console.log('\n=== servico_interno: quantas têm auditoria loja aprovado? ===');
  console.log(await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE EXISTS(
        SELECT 1 FROM alissonerp.auditorias a
        WHERE a.ordem_id=o.id AND a.tipo_auditoria::text='loja' AND a.situacao::text='aprovado'
      ))::int AS com_aud_loja_aprov,
      COUNT(*) FILTER (WHERE o.rota::text='protocolo')::int AS rota_protocolo,
      COUNT(*) FILTER (WHERE o.rota::text='pcp')::int AS rota_pcp
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem::text='servico_interno'
  `);

  console.log('\n=== Comparação: outros tipos de service — têm aud loja? ===');
  console.log(await sql`
    SELECT o.tipo_ordem::text AS tipo,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE EXISTS(
        SELECT 1 FROM alissonerp.auditorias a
        WHERE a.ordem_id=o.id AND a.tipo_auditoria::text='loja' AND a.situacao::text='aprovado'
      ))::int AS com_aud_loja_aprov
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem::text IN ('servico_venda','garantia','servico_interno')
    GROUP BY o.tipo_ordem::text
  `);
} finally {
  await sql.end();
}
