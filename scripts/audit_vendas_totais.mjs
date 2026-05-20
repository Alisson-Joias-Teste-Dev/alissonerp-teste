import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== AUDITORIA: Divergencias total_venda (vendas_erp vs public.vendas) ===\n');

  const [resumo] = await sql`
    SELECT
      COUNT(*)::int AS total_syncadas,
      COUNT(*) FILTER (WHERE ABS(ve.total_venda - pv.total_venda) > 0.01)::int AS divergentes,
      COALESCE(SUM(ABS(ve.total_venda - pv.total_venda)) FILTER (WHERE ABS(ve.total_venda - pv.total_venda) > 0.01), 0)::numeric AS soma_div
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
  `;
  console.log(`Vendas syncadas: ${resumo.total_syncadas}`);
  console.log(`Divergentes (>0.01): ${resumo.divergentes}`);
  console.log(`Soma divergencias: R$ ${Number(resumo.soma_div).toFixed(2)}`);

  if (resumo.divergentes > 0) {
    console.log('\nTop 20 divergencias:');
    const top = await sql`
      SELECT ve.id, ve.numero_venda, ve.total_venda AS erp_total,
             pv.total_venda AS pub_total,
             (ve.total_venda - pv.total_venda)::numeric AS diff,
             (SELECT COUNT(*) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id) AS qtd_itens_erp,
             (SELECT COUNT(*) FROM public.itens_venda WHERE venda_id = pv.id) AS qtd_itens_pub
      FROM alissonerp.vendas_erp ve
      JOIN public.vendas pv ON pv.id = ve.public_venda_id
      WHERE ABS(ve.total_venda - pv.total_venda) > 0.01
      ORDER BY ABS(ve.total_venda - pv.total_venda) DESC
      LIMIT 20
    `;
    for (const d of top) {
      console.log(`  #${d.id} (${d.numero_venda}): ERP=R$${Number(d.erp_total).toFixed(2)} Pub=R$${Number(d.pub_total).toFixed(2)} Diff=R$${Number(d.diff).toFixed(2)} itens_erp=${d.qtd_itens_erp} itens_pub=${d.qtd_itens_pub}`);
    }
  }

  // Check for duplicate items
  const [dup] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, '')))::int AS distincts
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
  `;
  const dups = dup.total - dup.distincts;
  console.log(`\nItens duplicados: ${dups} (total=${dup.total}, distinct=${dup.distincts})`);

  if (dups > 0) {
    console.log(' ⚠️  Existem duplicatas! Execute scripts/fix_duplicate_items.sql');
  } else if (resumo.divergentes === 0) {
    console.log('\n✅ Nenhum problema detectado.');
  } else {
    console.log(`\n⚠️  ${resumo.divergentes} vendas com divergencia (sem duplicatas). Verificar manualmente.`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
