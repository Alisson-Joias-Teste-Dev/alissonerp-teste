// Prepara o produto de teste MP — reutiliza o produto #1501019 que já tem
// vínculo Tiny (id_api_produto=743579620), atualizando nome e preço pra
// ficar usable em vendas de teste R$ 1,00.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== SETUP PRODUTO DE TESTE MP ===\n');

const ID_PRODUTO = 1501019;

try {
  // ── 1. Estado atual ──
  console.log('── Estado atual ──');
  const [antes] = await sql`
    SELECT id_produto, sku, nome, preco_sync, preco_total_sync, id_api_produto, situacao
    FROM public.produtos WHERE id_produto = ${ID_PRODUTO}
  `;
  if (!antes) throw new Error(`Produto ${ID_PRODUTO} não encontrado`);
  console.log(`  id=${antes.id_produto} | sku=${antes.sku} | ${antes.nome}`);
  console.log(`  preco_sync=${antes.preco_sync} | preco_total_sync=${antes.preco_total_sync}`);
  console.log(`  id_api_produto (Tiny)=${antes.id_api_produto} | situacao=${antes.situacao}`);

  // ── 2. UPDATE ──
  console.log('\n── UPDATE produto ──');
  await sql`
    UPDATE public.produtos
    SET
      nome             = 'Teste Pagamento MP R$ 1,00',
      preco_sync       = 1.00,
      preco_total_sync = 1.00,
      preco_tiny       = 1.00,
      situacao         = 'A'
    WHERE id_produto = ${ID_PRODUTO}
  `;
  console.log('  ✅ UPDATE aplicado');

  // ── 3. Estado depois ──
  console.log('\n── Estado depois ──');
  const [depois] = await sql`
    SELECT id_produto, sku, nome, preco_sync, preco_total_sync, preco_tiny, id_api_produto, situacao
    FROM public.produtos WHERE id_produto = ${ID_PRODUTO}
  `;
  console.log(`  id=${depois.id_produto} | sku=${depois.sku}`);
  console.log(`  nome=${depois.nome}`);
  console.log(`  preco_sync=${depois.preco_sync} | preco_total_sync=${depois.preco_total_sync}`);
  console.log(`  preco_tiny=${depois.preco_tiny}`);
  console.log(`  id_api_produto (Tiny)=${depois.id_api_produto}`);
  console.log(`  situacao=${depois.situacao}`);

  // ── 4. Verifica se aparece na busca do endpoint ──
  console.log('\n── Simulação da query do /api/vendas/produtos/busca ──');
  const busca = await sql`
    SELECT
      p.id_produto AS id, p.sku, p.nome,
      p.preco_sync AS preco_venda,
      p.peso_precificado, p.unidade
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    WHERE p.sku ILIKE '%TESTE-2026%' OR p.nome ILIKE '%Teste Pagamento%'
    LIMIT 5
  `;
  if (busca.length === 0) {
    console.log('  ⚠️  Produto não aparece na busca!');
  } else {
    busca.forEach(b => {
      console.log(`  #${b.id} | ${b.sku} | ${b.nome?.slice(0, 50)} | R$ ${b.preco_venda}`);
    });
  }

  console.log('\n=== PRONTO ✅ ===');
  console.log('\nComo usar no teste:');
  console.log('  1. Abra /vendas/nova no ERP');
  console.log('  2. Selecione um cliente qualquer');
  console.log('  3. Na busca de produtos, digite "Teste Pagamento" ou SKU "TESTE-2026-A"');
  console.log('  4. Adicione 1 unidade (total R$ 1,00)');
  console.log('  5. Preencha forma de pagamento = Pix → clique "Gerar QR Code Pix"');
  console.log('  6. Pague via app bancário (valor real R$ 1,00)');
  console.log('  7. Aguarde webhook confirmar → venda vira "concluido" automaticamente');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
