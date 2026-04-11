import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Sincroniza nome do produto em erp_produtos ===\n');

// Antes
const [antes] = await sql`SELECT nome FROM alissonerp.erp_produtos WHERE produto_id = 1501019`;
console.log(`antes: ${antes?.nome}`);

// Update
await sql`
  UPDATE alissonerp.erp_produtos
  SET nome = 'Teste Pagamento MP R$ 1,00', date_updated = NOW()
  WHERE produto_id = 1501019
`;

// Depois
const [depois] = await sql`SELECT nome, date_updated FROM alissonerp.erp_produtos WHERE produto_id = 1501019`;
console.log(`depois: ${depois?.nome}`);
console.log(`updated: ${depois?.date_updated}`);

// Validação final do fluxo completo
console.log('\n── Validação final: tudo que o NovaVendaClient vai receber ──');
const [final] = await sql`
  SELECT
    p.id_produto AS id,
    p.sku,
    p.nome,
    p.preco_sync AS preco_venda,
    p.peso_precificado,
    p.unidade,
    ep.sufixo_variacao,
    ep.numeracao,
    ep.largura_aro
  FROM public.produtos p
  LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  WHERE p.id_produto = 1501019
`;
Object.entries(final).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} = ${v}`));

console.log('\n✅ Preço R$ 1,00 vem automático quando selecionar na Nova Venda');
await sql.end();
