import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== TESTE da nova ordenação de busca ===\n');

const q = 'teste';

const produtos = await sql`
  SELECT
    p.id_produto AS id,
    p.sku,
    p.nome,
    p.preco_sync AS preco_venda,
    p.situacao,
    p.tipo
  FROM public.produtos p
  LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  WHERE
    p.sku  ILIKE ${'%' + q + '%'}
    OR p.nome ILIKE ${'%' + q + '%'}
  ORDER BY
    (p.situacao = 'A')                     DESC,
    (p.preco_sync IS NOT NULL AND p.preco_sync > 0) DESC,
    (p.tipo = 'S')                          DESC,
    (LOWER(p.sku)  = LOWER(${q}))           DESC,
    (LOWER(p.nome) LIKE LOWER(${q + '%'}))  DESC,
    p.nome
  LIMIT 20
`;

console.log(`Busca "${q}" — Top ${produtos.length}:\n`);
produtos.forEach((p, i) => {
  const preco = p.preco_venda ? `R$ ${Number(p.preco_venda).toFixed(2)}` : 'sem preço';
  const flag = p.id === 1501019 ? '  ← ESTE É O PRODUTO DE TESTE' : '';
  console.log(`  ${String(i + 1).padStart(2)}. #${p.id} | ${(p.sku ?? '—').padEnd(16)} | ${p.nome?.slice(0, 42).padEnd(42)} | ${preco}${flag}`);
});

await sql.end();
