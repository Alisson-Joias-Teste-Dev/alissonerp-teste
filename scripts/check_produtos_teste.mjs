import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Produtos candidatos para teste MP ===\n');

// Schema de public.produtos
const cols = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'produtos'
  ORDER BY ordinal_position
`;
console.log('Colunas relevantes:');
cols.filter(c => /id_produto|sku|nome|preco|id_api/.test(c.column_name))
  .forEach(c => console.log(`  ${c.column_name} (${c.data_type}) ${c.is_nullable === 'NO' ? 'NOT NULL' : ''}`));

console.log('\n── Top 10 produtos mais baratos com id_api_produto preenchido ──');
const baratos = await sql`
  SELECT id_produto, sku, nome, preco_sync, id_api_produto
  FROM public.produtos
  WHERE id_api_produto IS NOT NULL
    AND preco_sync IS NOT NULL
    AND preco_sync > 0
  ORDER BY preco_sync ASC
  LIMIT 10
`;
baratos.forEach(p => {
  console.log(`  #${p.id_produto} | SKU ${p.sku ?? '—'} | ${p.nome?.slice(0, 40)} | R$ ${Number(p.preco_sync).toFixed(2)} | tiny=${p.id_api_produto}`);
});

console.log('\n── Produtos com "teste" no nome (se existirem) ──');
const testes = await sql`
  SELECT id_produto, sku, nome, preco_sync, id_api_produto
  FROM public.produtos
  WHERE nome ILIKE '%teste%'
  LIMIT 5
`;
if (testes.length === 0) {
  console.log('  (nenhum produto com "teste" no nome)');
} else {
  testes.forEach(p => {
    console.log(`  #${p.id_produto} | SKU ${p.sku ?? '—'} | ${p.nome} | R$ ${p.preco_sync} | tiny=${p.id_api_produto ?? 'NULL'}`);
  });
}

console.log('\n── Total de produtos com Tiny vinculado ──');
const [{ total }] = await sql`
  SELECT COUNT(*)::int AS total FROM public.produtos WHERE id_api_produto IS NOT NULL
`;
console.log(`  ${total} produtos vinculados ao Tiny`);

await sql.end();
