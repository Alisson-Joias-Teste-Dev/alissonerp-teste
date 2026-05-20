import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== CONTAGEM DE DUPLICATAS EM itens_venda_erp ===\n');

  // Count duplicates
  const [dupCount] = await sql`
    SELECT 
      COUNT(*) as total_items,
      COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, ''))) as distinct_combos,
      COUNT(*) - COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, ''))) as duplicates_to_remove
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
  `;
  console.log(`Total items: ${dupCount.total_items}`);
  console.log(`Distinct (venda, produto, sku): ${dupCount.distinct_combos}`);
  console.log(`Duplicatas a remover: ${dupCount.duplicates_to_remove}`);

  // Count vendas affected
  const [vendasAffected] = await sql`
    SELECT COUNT(DISTINCT venda_id) as cnt
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
    GROUP BY venda_id, produto_id, COALESCE(sku, '')
    HAVING COUNT(*) > 1
  `;
  
  const [vendasWithDup] = await sql`
    SELECT COUNT(DISTINCT venda_id) as cnt
    FROM alissonerp.itens_venda_erp ive
    WHERE produto_id IS NOT NULL
      AND venda_id IN (
        SELECT venda_id FROM alissonerp.itens_venda_erp
        WHERE produto_id IS NOT NULL
        GROUP BY venda_id, produto_id, COALESCE(sku, '')
        HAVING COUNT(*) > 1
      )
  `;
  console.log(`Vendas com duplicatas: ${vendasWithDup.cnt}`);

  // Top duplicated products
  console.log('\nTop produtos duplicados:');
  const topDup = await sql`
    SELECT produto_id, 
           MIN(nome_produto) as nome,
           COALESCE(sku, 'NULL') as sku_val,
           COUNT(*) as copies,
           COUNT(DISTINCT venda_id) as vendas_afetadas
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
    GROUP BY produto_id, COALESCE(sku, '')
    HAVING COUNT(*) > COUNT(DISTINCT venda_id)
    ORDER BY copies DESC
    LIMIT 10
  `;
  for (const d of topDup) {
    console.log(`  prod=${d.produto_id} ${d.nome} sku=${d.sku_val} copies=${d.copies} vendas=${d.vendas_afetadas}`);
  }

  // Check payments on affected orders
  console.log('\nPagamentos em vendas com total errado (top 10):');
  const topPayments = await sql`
    WITH divergentes AS (
      SELECT ve.id, ve.numero_venda, ve.total_venda as erp_total, pv.total_venda as pub_total
      FROM alissonerp.vendas_erp ve
      JOIN public.vendas pv ON pv.id = ve.public_venda_id
      WHERE ABS(ve.total_venda - pv.total_venda) > 100
      ORDER BY ABS(ve.total_venda - pv.total_venda) DESC
      LIMIT 10
    )
    SELECT d.numero_venda,
           d.erp_total,
           d.pub_total,
           d.erp_total - d.pub_total as diff,
           COUNT(pg.id) as qtd_pagamentos,
           SUM(pg.valor) FILTER (WHERE pg.status = 'confirmado') as soma_confirmados,
           SUM(pg.valor) FILTER (WHERE pg.status = 'pendente') as soma_pendentes,
           SUM(pg.valor) FILTER (WHERE pg.status = 'estornado') as soma_estornados
    FROM divergentes d
    LEFT JOIN alissonerp.pagamentos_venda pg ON pg.venda_id = d.id
    GROUP BY d.numero_venda, d.erp_total, d.pub_total
    ORDER BY diff DESC
  `;
  for (const p of topPayments) {
    console.log(`  ${p.numero_venda}: ERP=R$${Number(p.erp_total).toFixed(2)} Pub=R$${Number(p.pub_total).toFixed(2)} Diff=R$${Number(p.diff).toFixed(2)} pags=${p.qtd_pagamentos} confirm=R$${Number(p.soma_confirmados||0).toFixed(2)} pendente=R$${Number(p.soma_pendentes||0).toFixed(2)} estornado=R$${Number(p.soma_estornados||0).toFixed(2)}`);
  }

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
