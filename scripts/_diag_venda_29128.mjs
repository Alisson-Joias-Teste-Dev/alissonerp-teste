/**
 * Diagnóstico da venda 29128 para verificar por que não está no Tiny
 */
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

(async () => {
  try {
    // 1. Verificar colunas da tabela vendas_erp primeiro
    const colunas = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'vendas_erp'
      ORDER BY ordinal_position
    `;
    console.log('=== COLUNAS vendas_erp ===');
    colunas.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));

    // 2. Dados da venda 29128
    const [venda] = await sql`
      SELECT * FROM alissonerp.vendas_erp WHERE id = 29128
    `;
    console.log('\n=== VENDA 29128 ===');
    console.log(JSON.stringify(venda, null, 2));

    if (!venda) {
      console.log('\n❌ Venda 29128 não encontrada!');
      return;
    }

    console.log('\n=== DIAGNÓSTICO ===');
    console.log(`tiny_pedido_id: ${venda.tiny_pedido_id || '(vazio)'}`);
    console.log(`tiny_sync_status: ${venda.tiny_sync_status || '(vazio)'}`);
    console.log(`tiny_sync_erro: ${venda.tiny_sync_erro || '(vazio)'}`);
    console.log(`tiny_sync_at: ${venda.tiny_sync_at || '(vazio)'}`);
    console.log(`status: ${venda.status}`);
    console.log(`status_pagamento: ${venda.status_pagamento}`);
    console.log(`numero_venda: ${venda.numero_venda}`);

    // 3. Dados do cliente
    if (venda.cliente_id) {
      const [cliente] = await sql`
        SELECT id_contato, nome, cpf_cnpj, id_api_contato, email, telefone
        FROM public.contatos WHERE id_contato = ${venda.cliente_id}
      `;
      console.log('\n=== CLIENTE ===');
      console.log(`  nome: ${cliente?.nome || '(nulo)'}`);
      console.log(`  cpf_cnpj: ${cliente?.cpf_cnpj || '(nulo)'}`);
      console.log(`  id_api_contato (Tiny): ${cliente?.id_api_contato || '❌ NÃO MAPEADO'}`);
    }

    // 4. Dados do vendedor
    if (venda.vendedor_id) {
      const [vendedor] = await sql`
        SELECT id_vendedor, nome, id_api_vendedor
        FROM public.vendedores WHERE id_vendedor = ${venda.vendedor_id}
      `;
      console.log('\n=== VENDEDOR ===');
      console.log(`  nome: ${vendedor?.nome || '(nulo)'}`);
      console.log(`  id_api_vendedor (Tiny): ${vendedor?.id_api_vendedor || '❌ NÃO MAPEADO'}`);
    }

    // 5. Itens
    const itens = await sql`SELECT * FROM alissonerp.itens_venda_erp WHERE venda_id = 29128 ORDER BY id`;
    console.log('\n=== ITENS (' + itens.length + ') ===');
    itens.forEach(item => console.log(`  id=${item.id}, produto_id=${item.produto_id}, nome="${item.nome_produto}", sku="${item.sku}", qtd=${item.quantidade}, preco=${item.preco_unitario}`));

    // 6. Pagamentos
    const pagamentos = await sql`SELECT * FROM alissonerp.pagamentos_venda WHERE venda_id = 29128 ORDER BY id`;
    console.log('\n=== PAGAMENTOS (' + pagamentos.length + ') ===');
    pagamentos.forEach(p => console.log(`  forma="${p.forma}", gateway="${p.gateway}", valor=${p.valor}, parcelas=${p.parcelas}`));

    // 7. Verificar mapeamento de produtos no Tiny
    const produtoIds = itens.map(i => i.produto_id).filter(Boolean);
    if (produtoIds.length > 0) {
      const produtosTiny = await sql`
        SELECT id_produto, id_api_produto, sku, nome 
        FROM public.produtos WHERE id_produto = ANY(${produtoIds})
      `;
      console.log('\n=== MAPEAMENTO PRODUTOS TINY ===');
      produtosTiny.forEach(p => {
        console.log(`  produto_id=${p.id_produto}, sku="${p.sku}", nome="${p.nome}", id_api_produto=${p.id_api_produto || '❌ NÃO MAPEADO'}`);
      });

      const semMap = produtosTiny.filter(p => !p.id_api_produto);
      if (semMap.length > 0) {
        console.log(`\n⚠️ ${semMap.length} produto(s) sem id_api_produto no Tiny`);
      }
    }

    // 8. Verificar forma de pagamento no Tiny
    if (pagamentos.length > 0) {
      const formaPag = pagamentos[0].forma;
      const [fpRow] = await sql`SELECT id, id_api_tiny, descricao FROM public.forma_pagamento WHERE descricao = ${formaPag} AND status = true LIMIT 1`;
      console.log(`\n=== FORMA PAGAMENTO: "${formaPag}" ===`);
      console.log(`  id_api_tiny: ${fpRow?.id_api_tiny || '❌ NÃO MAPEADO'}`);
      
      if (pagamentos[0].gateway && fpRow?.id) {
        const [mpRow] = await sql`
          SELECT mp.id_api_tiny, mp.descricao FROM public.meio_pagamento mp
          JOIN public.forma_pagamento fp ON fp.id = mp.forma_pagamento_id
          WHERE fp.descricao = ${formaPag} AND mp.descricao = ${pagamentos[0].gateway} AND mp.status = true LIMIT 1
        `;
        console.log(`  gateway="${pagamentos[0].gateway}", meio_pagamento_id_api_tiny: ${mpRow?.id_api_tiny || '❌ NÃO MAPEADO'}`);
      }
    }

    // 9. Verificar se existe tiny_produto_generico configurado
    const [genProd] = await sql`
      SELECT chave, valor_encrypted FROM alissonerp.configuracoes_secrets WHERE chave = 'tiny_produto_generico'
    `;
    if (genProd) {
      console.log('\n=== PRODUTO GENÉRICO TINY ===');
      console.log(`  valor: ${genProd.valor_encrypted}`);
    }

  } catch(e) { 
    console.error('ERRO:', e); 
  }
  finally { 
    await sql.end(); 
  }
})();
