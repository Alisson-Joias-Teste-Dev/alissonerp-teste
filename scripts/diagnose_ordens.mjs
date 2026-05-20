// Diagnóstico: por que numero_pedido está NULL nas ordens novas
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Definição da view
  console.log('=== 1. Definição da view vw_ordens_completa (primeiras 3000 chars) ===');
  const [viewDef] = await sql`
    SELECT pg_get_viewdef('alissonerp.vw_ordens_completa'::regclass, true) AS def
  `;
  console.log(viewDef.def.substring(0, 3000));
  console.log('\n--- (continua se maior) ---\n');

  // 2. Amostra de ordens recentes com numero_pedido
  console.log('=== 2. Últimas 15 ordens (id, numero_ordem, numero_pedido, orcamento_id?) ===');
  const ordens = await sql`
    SELECT id, numero_ordem, numero_pedido, rota, tipo_ordem, situacao
    FROM alissonerp.vw_ordens_completa
    ORDER BY id DESC
    LIMIT 15
  `;
  ordens.forEach(o => {
    console.log(`  ID ${o.id} | Ordem ${o.numero_ordem} | Pedido: ${o.numero_pedido ?? 'NULL'} | Rota: ${o.rota} | Tipo: ${o.tipo_ordem}`);
  });

  // 3. Verificar ordens na tabela base (sem view)
  console.log('\n=== 3. Últimas 10 ordens direto da tabela alissonerp.ordens ===');
  const ordensBase = await sql`
    SELECT id, metadata->>'numero_ordem' AS numero_ordem,
           metadata->>'orcamento_id' AS orcamento_id,
           metadata->>'origem' AS origem,
           rota, tipo_ordem
    FROM alissonerp.ordens
    ORDER BY id DESC
    LIMIT 10
  `;
  ordensBase.forEach(o => {
    console.log(`  ID ${o.id} | Ordem ${o.numero_ordem} | OrcamentoID ${o.orcamento_id ?? 'NULL'} | Origem ${o.origem ?? 'NULL'} | Rota ${o.rota}`);
  });

  // 4. Procurar tabela de relação ordens <-> vendas_erp
  console.log('\n=== 4. Buscar colunas que ligam ordens a vendas ===');
  const cols = await sql`
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.column_name ILIKE '%venda%' OR c.column_name ILIKE '%pedido%'
    ORDER BY c.table_schema, c.table_name, c.column_name
  `;
  cols.forEach(c => console.log(`  ${c.table_schema}.${c.table_name}.${c.column_name}`));

  // 5. Amostra de vendas_erp com orcamento_id
  console.log('\n=== 5. Últimas 10 vendas_erp (numero_venda, orcamento_id, situacao) ===');
  const vendas = await sql`
    SELECT id, numero_venda, orcamento_id, situacao, data_venda
    FROM alissonerp.vendas_erp
    ORDER BY id DESC
    LIMIT 10
  `;
  vendas.forEach(v => {
    console.log(`  ID ${v.id} | Venda ${v.numero_venda} | OrcID ${v.orcamento_id ?? 'NULL'} | Situacao ${v.situacao}`);
  });

  // 6. Verificar se orcamentos têm ordem_gerada_id
  console.log('\n=== 6. Últimos 10 orcamentos (numero_orcamento, ordem_gerada_id, venda_gerada_id) ===');
  const orcs = await sql`
    SELECT id, numero_orcamento, ordem_gerada_id, venda_gerada_id, status
    FROM alissonerp.orcamentos
    ORDER BY id DESC
    LIMIT 10
  `;
  orcs.forEach(o => {
    console.log(`  ID ${o.id} | ${o.numero_orcamento} | OrdemID ${o.ordem_gerada_id ?? 'NULL'} | VendaID ${o.venda_gerada_id ?? 'NULL'} | Status ${o.status}`);
  });

} finally {
  await sql.end();
}
