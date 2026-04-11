// Diagnóstico v2: ver colunas da tabela ordens e vendas_erp
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Colunas da tabela ordens
  console.log('=== 1. Colunas de alissonerp.ordens ===');
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens'
    ORDER BY ordinal_position
  `;
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

  // 2. Últimas ordens (colunas essenciais)
  console.log('\n=== 2. Últimas 10 ordens — numero_pedido + venda_erp_id (se existir) ===');
  // Primeiro descobre se tem coluna venda_erp_id / venda_id
  const hasVendaId = cols.some(c => c.column_name === 'venda_id' || c.column_name === 'venda_erp_id');
  console.log(`  tem coluna venda_id/venda_erp_id: ${hasVendaId}`);

  const ordens = await sql`
    SELECT id, numero_ordem, numero_pedido, rota, tipo_ordem, situacao, vendedor_id
    FROM alissonerp.ordens
    ORDER BY id DESC
    LIMIT 10
  `;
  ordens.forEach(o => {
    console.log(`  ID ${o.id} | ${o.numero_ordem} | pedido: ${o.numero_pedido ?? 'NULL'} | rota: ${o.rota} | tipo: ${o.tipo_ordem}`);
  });

  // 3. Verificar o que liga vendas_erp a ordens
  console.log('\n=== 3. vendas_erp colunas ===');
  const vCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'vendas_erp'
    ORDER BY ordinal_position
  `;
  vCols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

  // 4. Últimas vendas_erp
  console.log('\n=== 4. Últimas 10 vendas_erp ===');
  const vendas = await sql`
    SELECT id, numero_venda, orcamento_id, situacao, data_venda
    FROM alissonerp.vendas_erp
    ORDER BY id DESC
    LIMIT 10
  `;
  vendas.forEach(v => {
    console.log(`  ID ${v.id} | Venda ${v.numero_venda} | OrcID ${v.orcamento_id ?? 'NULL'} | Situacao ${v.situacao}`);
  });

  // 5. Verificar se existe relação de orcamento_id em alissonerp.ordens
  console.log('\n=== 5. Colunas que podem ligar ordens a orcamentos/vendas ===');
  cols
    .filter(c => c.column_name.match(/orcamento|venda|pedido/i))
    .forEach(c => console.log(`  ${c.column_name}: ${c.data_type}`));

} finally {
  await sql.end();
}
