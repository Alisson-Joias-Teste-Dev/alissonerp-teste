import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  console.log('=== 1. Config service_tipos_ordem ===');
  const cfg = await sql`SELECT chave, valor FROM alissonerp.configuracoes_sistema WHERE chave='service_tipos_ordem'`;
  console.log(cfg.length ? cfg : 'NÃO CONFIGURADO (default do código: servico_venda, garantia, servico_interno)');

  console.log('\n=== 2. Total ordens servico_interno ===');
  console.log(await sql`SELECT COUNT(*)::int AS n FROM alissonerp.ordens WHERE tipo_ordem::text='servico_interno'`);

  console.log('\n=== 3. servico_interno por status ===');
  console.log(await sql`SELECT status::text, COUNT(*)::int AS n FROM alissonerp.ordens WHERE tipo_ordem::text='servico_interno' GROUP BY status ORDER BY n DESC`);

  console.log('\n=== 4. vw_ordens_prontas_ida tem servico_interno? ===');
  console.log(await sql`
    SELECT COUNT(*)::int AS n
    FROM alissonerp.vw_ordens_prontas_ida v
    JOIN alissonerp.ordens o ON o.id = v.id
    WHERE o.tipo_ordem::text='servico_interno'
  `);

  console.log('\n=== 5. Protocolos ida PENDENTES com servico_interno ===');
  console.log(await sql`
    SELECT p.id, p.tipo_protocolo, p.etapas::text AS etapas, o.numero_ordem, o.tipo_ordem::text AS tipo_ordem, o.status::text AS ordem_status
    FROM alissonerp.protocolos p
    JOIN alissonerp.protocolo_ordens po ON po.protocolo_id=p.id
    JOIN alissonerp.ordens o ON o.id=po.ordem_id
    WHERE o.tipo_ordem::text='servico_interno' AND p.direcao='ida' AND p.etapas='pendente'
    LIMIT 20
  `);

  console.log('\n=== 6. Amostra de servico_interno (últimas 5) — diagnóstico ===');
  console.log(await sql`
    SELECT o.id, o.numero_ordem, o.tipo_ordem::text AS tipo_ordem, o.status::text AS status,
           o.peso_peca_servico, o.foto_peca_servico IS NOT NULL AS tem_foto, o.cliente_id,
           o.created_at::date AS criada
    FROM alissonerp.ordens o
    WHERE o.tipo_ordem::text='servico_interno'
    ORDER BY o.id DESC LIMIT 5
  `);

  console.log('\n=== 7. Definição da view vw_ordens_prontas_ida ===');
  const v = await sql`SELECT pg_get_viewdef('alissonerp.vw_ordens_prontas_ida'::regclass, true) AS def`;
  console.log(v[0]?.def);
} finally {
  await sql.end();
}
