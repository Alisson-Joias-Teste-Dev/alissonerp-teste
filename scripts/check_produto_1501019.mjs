import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Estado do produto 1501019 nas duas tabelas ===\n');

console.log('── public.produtos (id_produto=1501019) ──');
const [pub] = await sql`
  SELECT id_produto, sku, nome, preco_sync, preco_tiny, preco_total_sync,
         preco_promocional, preco_na_cotacao, id_api_produto, situacao, tipo
  FROM public.produtos WHERE id_produto = 1501019
`;
if (pub) {
  Object.entries(pub).forEach(([k, v]) => console.log(`  ${k.padEnd(24)} = ${v}`));
} else {
  console.log('  NÃO ENCONTRADO');
}

console.log('\n── alissonerp.erp_produtos (produto_id=1501019) ──');
const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
  ORDER BY ordinal_position
`;
console.log(`  Colunas: ${cols.map(c => c.column_name).join(', ')}`);

const [erp] = await sql`
  SELECT * FROM alissonerp.erp_produtos WHERE produto_id = 1501019
`;
if (erp) {
  Object.entries(erp).forEach(([k, v]) => {
    if (v !== null) console.log(`  ${k.padEnd(24)} = ${v}`);
  });
} else {
  console.log('  NÃO ENCONTRADO');
}

console.log('\n── Query que o NovaVenda usa (busca "teste") ──');
const [r] = await sql`
  SELECT
    p.id_produto AS id, p.sku, p.nome,
    p.preco_sync AS preco_venda, p.peso_precificado, p.unidade,
    ep.sufixo_variacao, ep.numeracao, ep.largura_aro
  FROM public.produtos p
  LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  WHERE p.id_produto = 1501019
`;
console.log('  id          =', r?.id);
console.log('  sku         =', r?.sku);
console.log('  nome        =', r?.nome);
console.log('  preco_venda =', r?.preco_venda, '← este é o valor que o front recebe');

console.log('\n── Triggers em erp_produtos ──');
const triggers = await sql`
  SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
  WHERE event_object_schema = 'alissonerp' AND event_object_table = 'erp_produtos'
`;
triggers.forEach(t => console.log(`  ${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`));
if (triggers.length === 0) console.log('  (nenhum trigger)');

await sql.end();
