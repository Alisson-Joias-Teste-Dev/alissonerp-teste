import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== DIAGNÓSTICO PRODUTOS DE TESTE ===\n');

// 1. Estado atual dos produtos de teste visíveis
console.log('── Produtos de teste que aparecem na busca do print ──');
const lista = await sql`
  SELECT id_produto, sku, nome, preco_sync, preco_tiny, preco_total_sync,
         id_api_produto, situacao, tipo
  FROM public.produtos
  WHERE nome ILIKE '%teste%' OR sku ILIKE '%TESTE%'
  ORDER BY id_produto
  LIMIT 20
`;
lista.forEach(p => {
  console.log(`  #${p.id_produto} | ${p.sku ?? '—'} | ${p.nome?.slice(0, 50)}`);
  console.log(`    preco_sync=${p.preco_sync} | preco_tiny=${p.preco_tiny} | situacao=${p.situacao} | tipo=${p.tipo}`);
  console.log(`    tiny=${p.id_api_produto}`);
});

// 2. Estado do produto 1501019 que eu atualizei
console.log('\n── Produto 1501019 (o que atualizei antes) ──');
const [target] = await sql`
  SELECT * FROM public.produtos WHERE id_produto = 1501019
`;
if (target) {
  console.log(`  nome: ${target.nome}`);
  console.log(`  preco_sync: ${target.preco_sync}`);
  console.log(`  preco_tiny: ${target.preco_tiny}`);
  console.log(`  preco_total_sync: ${target.preco_total_sync}`);
  console.log(`  data_atualizacao_preco: ${target.data_atualizacao_preco}`);
}

// 3. Existe trigger em public.produtos?
console.log('\n── Triggers em public.produtos ──');
const triggers = await sql`
  SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
  WHERE event_object_schema = 'public' AND event_object_table = 'produtos'
`;
if (triggers.length === 0) {
  console.log('  (nenhum trigger)');
} else {
  triggers.forEach(t => console.log(`  ${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`));
}

// 4. Query que o endpoint /api/vendas/produtos/busca executa (teste)
console.log('\n── Query do endpoint busca "teste" ──');
const q = 'teste';
const resultado = await sql`
  SELECT
    p.id_produto AS id, p.sku, p.nome,
    p.preco_sync AS preco_venda,
    p.peso_precificado, p.unidade
  FROM public.produtos p
  LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  WHERE p.sku ILIKE ${'%' + q + '%'} OR p.nome ILIKE ${'%' + q + '%'}
  ORDER BY p.nome
  LIMIT 20
`;
console.log(`  ${resultado.length} resultados:`);
resultado.forEach((r, i) => {
  console.log(`  ${i + 1}. #${r.id} | ${r.sku ?? '—'} | ${r.nome?.slice(0, 45)} | R$ ${r.preco_venda ?? 'null'}`);
});

await sql.end();
