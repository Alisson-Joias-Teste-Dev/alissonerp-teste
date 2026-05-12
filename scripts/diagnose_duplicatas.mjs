import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== ANALISE DE DUPLICATAS NOS PIORES CASOS ===\n');

  // Check some worst cases
  const cases = [
    { erpId: 21977, desc: 'ERP#21977 (344 itens vs 8 public)' },
    { erpId: 15076, desc: 'ERP#15076 (512 itens vs 8 public)' },
    { erpId: 18644, desc: 'ERP#18644 (216 itens vs 6 public)' },
    { erpId: 23468, desc: 'ERP#23468 (68 itens vs 8 public)' },
  ];

  for (const c of cases) {
    console.log(`\n=== ${c.desc} ===`);
    
    // Count distinct product_id+sku combos
    const [erp] = await sql`SELECT id, numero_venda, total_venda, public_venda_id FROM alissonerp.vendas_erp WHERE id = ${c.erpId}`;
    if (!erp) { console.log('  Nao encontrado'); continue; }

    const [pub] = await sql`SELECT id, total_venda FROM public.vendas WHERE id = ${erp.public_venda_id}`;
    
    // Check for duplicates in ERP items
    const dupGroups = await sql`
      SELECT produto_id, nome_produto, sku, COUNT(*) as cnt, SUM(total_item) as sum_total
      FROM alissonerp.itens_venda_erp
      WHERE venda_id = ${c.erpId}
      GROUP BY produto_id, nome_produto, sku
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `;

    console.log('  ERP total_venda: ' + erp.total_venda + ' | Pub total_venda: ' + (pub?.total_venda || 'N/A'));
    console.log('  Grupos duplicados:');
    for (const g of dupGroups) {
      console.log(`    prod=${g.nome_produto} sku=${g.sku} copies=${g.cnt} sum=${g.sum_total}`);
    }

    // Count distinct item combinations
    const [distinct] = await sql`
      SELECT COUNT(DISTINCT (produto_id, COALESCE(sku,''))) as cnt 
      FROM alissonerp.itens_venda_erp WHERE venda_id = ${c.erpId}
    `;
    const [total_] = await sql`
      SELECT COUNT(*) as cnt FROM alissonerp.itens_venda_erp WHERE venda_id = ${c.erpId}
    `;
    console.log('  Total items: ' + total_.cnt + ' | Distinct (prod,sku): ' + distinct.cnt);
  }

  // Find pattern - how many orders are affected and total impact
  console.log('\n\n=== RESUMO DO IMPACTO ===');
  const summary = await sql`
    SELECT 
      COUNT(*) as qtd_vendas,
      SUM(ABS(ve.total_venda - pv.total_venda)) as soma_divergencia,
      AVG(ABS(ve.total_venda - pv.total_venda)) as media_divergencia,
      MIN(ABS(ve.total_venda - pv.total_venda)) as min_div,
      MAX(ABS(ve.total_venda - pv.total_venda)) as max_div
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda - pv.total_venda) > 0.01
  `;
  console.log('Vendas com divergencia: ' + summary[0].qtd_vendas);
  console.log('Soma total das divergencias: R$ ' + Number(summary[0].soma_divergencia).toFixed(2));
  console.log('Media: R$ ' + Number(summary[0].media_divergencia).toFixed(2));

  // How many have items > 2x the public item count?
  const multi = await sql`
    SELECT COUNT(*) as cnt
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE (
      SELECT COUNT(*) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id
    ) > 2 * (
      SELECT COUNT(*) FROM public.itens_venda WHERE venda_id = pv.id
    )
  `;
  console.log('Vendas com mais que 2x itens do public: ' + multi[0].cnt);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
