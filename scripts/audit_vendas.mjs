import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== AUDITORIA VENDAS: public.vendas vs alissonerp.vendas_erp ===\n');

try {
  // 1. Contagem
  const [cPub] = await sql`SELECT COUNT(*)::int AS cnt FROM public.vendas`;
  const [cErp] = await sql`SELECT COUNT(*)::int AS cnt FROM alissonerp.vendas_erp`;
  const [cLink] = await sql`SELECT COUNT(*)::int AS cnt FROM alissonerp.vendas_erp WHERE public_venda_id IS NOT NULL`;
  const [semLink] = await sql`SELECT COUNT(*)::int AS cnt FROM alissonerp.vendas_erp WHERE public_venda_id IS NULL`;
  const [semErp] = await sql`
    SELECT COUNT(*)::int AS cnt FROM public.vendas pv
    WHERE NOT EXISTS (SELECT 1 FROM alissonerp.vendas_erp ve WHERE ve.public_venda_id = pv.id)
  `;

  console.log('CONTAGEM:');
  console.log(`  public.vendas:              ${cPub.cnt}`);
  console.log(`  alissonerp.vendas_erp:      ${cErp.cnt}`);
  console.log(`  vendas_erp com link:        ${cLink.cnt}`);
  console.log(`  vendas_erp SEM link:        ${semLink.cnt}`);
  console.log(`  public.vendas SEM ERP:      ${semErp.cnt}`);

  // 2. Divergências de total
  const divTotal = await sql`
    SELECT ve.id AS erp_id, ve.numero_venda,
           ve.total_venda::numeric AS erp_total,
           pv.total_venda::numeric AS pub_total,
           (ve.total_venda::numeric - pv.total_venda::numeric) AS diff
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda::numeric - pv.total_venda::numeric) > 0.01
    ORDER BY ABS(ve.total_venda::numeric - pv.total_venda::numeric) DESC
    LIMIT 30
  `;
  const [cntDivTotal] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda::numeric - pv.total_venda::numeric) > 0.01
  `;

  console.log(`\nDIVERGÊNCIAS DE TOTAL: ${cntDivTotal.cnt} vendas`);
  if (divTotal.length > 0) {
    console.log('  ERP_ID | Nº Venda       | ERP           | Public        | Diff');
    divTotal.forEach(d => {
      const erpT = `R$ ${Number(d.erp_total).toFixed(2).padStart(12)}`;
      const pubT = `R$ ${Number(d.pub_total).toFixed(2).padStart(12)}`;
      const diff = `R$ ${Number(d.diff).toFixed(2).padStart(12)}`;
      console.log(`  ${String(d.erp_id).padEnd(6)} | ${String(d.numero_venda).padEnd(14)} | ${erpT} | ${pubT} | ${diff}`);
    });
  }

  // 3. Divergências de situação
  // Mapeamento: public.status → ERP.situacao
  // NULL/0 = rascunho, 1 = aprovado, 2 = concluido, 3 = cancelado (ou invertido?)
  const divStatus = await sql`
    SELECT ve.id, ve.numero_venda, ve.situacao AS erp_sit, pv.status AS pub_status
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE NOT (
      (ve.situacao = 'rascunho'   AND (pv.status IS NULL OR pv.status = 0)) OR
      (ve.situacao = 'aprovado'   AND pv.status = 1) OR
      (ve.situacao = 'enviado'    AND pv.status = 1) OR
      (ve.situacao = 'concluido'  AND (pv.status = 2 OR pv.status = 3)) OR
      (ve.situacao = 'cancelado'  AND (pv.status = 4 OR pv.status = 3)) OR
      (ve.situacao = 'em_revisao' AND pv.status IS NOT NULL)
    )
    LIMIT 30
  `;
  console.log(`\nDIVERGÊNCIAS DE STATUS: ${divStatus.length}+ vendas`);
  if (divStatus.length > 0) {
    divStatus.slice(0, 15).forEach(d => {
      console.log(`  #${d.id} (${d.numero_venda}): ERP=${d.erp_sit} | Public.status=${d.pub_status}`);
    });
  }

  // 4. Soma por situação
  const somaErp = await sql`
    SELECT situacao, COUNT(*)::int AS cnt, COALESCE(SUM(total_venda), 0)::numeric AS soma
    FROM alissonerp.vendas_erp GROUP BY situacao ORDER BY situacao
  `;
  console.log('\nSOMA POR SITUAÇÃO (ERP):');
  somaErp.forEach(r => console.log(`  ${r.situacao.padEnd(12)}: ${String(r.cnt).padStart(6)} vendas, R$ ${Number(r.soma).toFixed(2)}`));

  const somaPub = await sql`
    SELECT status, COUNT(*)::int AS cnt, COALESCE(SUM(total_venda), 0)::numeric AS soma
    FROM public.vendas GROUP BY status ORDER BY status
  `;
  console.log('\nSOMA POR STATUS (Public):');
  somaPub.forEach(r => console.log(`  status=${String(r.status).padEnd(5)}: ${String(r.cnt).padStart(6)} vendas, R$ ${Number(r.soma).toFixed(2)}`));

  // 5. Vendas recentes sem sync (criadas no ERP sem public_venda_id)
  const semSync = await sql`
    SELECT id, numero_venda, situacao, total_venda, created_at::text
    FROM alissonerp.vendas_erp
    WHERE public_venda_id IS NULL
    ORDER BY id DESC
  `;
  console.log(`\nVENDAS ERP SEM LINK AO PUBLIC (${semSync.length}):`);
  semSync.forEach(v => console.log(`  #${v.id} (${v.numero_venda}) ${v.situacao} R$${Number(v.total_venda).toFixed(2)} — ${v.created_at}`));

  // 6. Vendas public sem ERP (amostra)
  const pubSemErp = await sql`
    SELECT pv.id, pv.numero_pedido, pv.status, pv.total_venda, pv.created_at::text
    FROM public.vendas pv
    WHERE NOT EXISTS (SELECT 1 FROM alissonerp.vendas_erp ve WHERE ve.public_venda_id = pv.id)
    ORDER BY pv.id DESC
    LIMIT 15
  `;
  console.log(`\nVENDAS PUBLIC SEM ERP (amostra de ${pubSemErp.length}):`);
  pubSemErp.forEach(v => console.log(`  pub#${v.id} pedido=${v.numero_pedido} status=${v.status} R$${Number(v.total_venda).toFixed(2)} — ${v.created_at}`));

  console.log('\n=== AUDITORIA CONCLUÍDA ===');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
