const postgres = require('C:\\Users\\jonat\\fabricaAJ\\node_modules\\postgres');
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres');

async function run() {
  // O que a tela usa: vw_estoque_directus_saldo filtrado por categoria_id=1
  // totalOuro = SUM(saldo) WHERE categoria_id=1
  const q1 = await sql`
    SELECT deposito_id, deposito_nome, insumo_id, insumo_nome,
           categoria_nome, categoria_id,
           total_entrada, total_saida, saldo
    FROM alissonerp.vw_estoque_directus_saldo
    WHERE categoria_id = 1
    ORDER BY insumo_id, deposito_id
  `;
  console.log('=== vw_estoque_directus_saldo WHERE categoria_id=1 ===');
  q1.forEach(r => console.log(`  deposito=${r.deposito_id}(${r.deposito_nome}) insumo=${r.insumo_id}(${r.insumo_nome}) saldo=${r.saldo}`));
  const totalOuro = q1.reduce((s, r) => s + Number(r.saldo || 0), 0);
  console.log('  => totalOuro calculado pela tela:', totalOuro.toFixed(2));

  // O que deveria ser: vw_saldo_pote categoria=1 (saldo total real)
  const q2 = await sql`SELECT * FROM alissonerp.vw_saldo_pote WHERE categoria_id = 1`;
  console.log('\n=== vw_saldo_pote categoria=1 (CORRETO) ===');
  q2.forEach(r => console.log(JSON.stringify(r)));

  // Quais insumos categoria=1 existem em movimentacoes_estoque mas NÃO em vw_estoque_directus_saldo?
  const q3 = await sql`
    SELECT DISTINCT i.id, i.nome
    FROM alissonerp.movimentacoes_estoque m
    JOIN alissonerp.insumos i ON i.id = m.insumo_id
    WHERE i.categoria_id = 1
    AND i.id NOT IN (
      SELECT insumo_id FROM alissonerp.vw_estoque_directus_saldo WHERE categoria_id = 1
    )
  `;
  console.log('\n=== Insumos cat=1 com movimentacoes mas FORA de vw_estoque_directus_saldo ===');
  if (q3.length === 0) console.log('  nenhum');
  else q3.forEach(r => console.log('  id='+r.id, r.nome));

  // Origem de vw_estoque_directus_saldo: ela vem de alissonerp.movimentacoes_estoque
  // Vamos checar se todos insumos categoria=1 têm movimentacoes
  const q4 = await sql`
    SELECT i.id, i.nome,
      COALESCE(SUM(m.entrada), 0) AS total_entrada,
      COALESCE(SUM(m.saida), 0) AS total_saida,
      COALESCE(SUM(m.entrada), 0) - COALESCE(SUM(m.saida), 0) AS saldo_real
    FROM alissonerp.insumos i
    LEFT JOIN alissonerp.movimentacoes_estoque m ON m.insumo_id = i.id
    WHERE i.categoria_id = 1 AND i.ativo = true
    GROUP BY i.id, i.nome
    ORDER BY i.id
  `;
  console.log('\n=== Saldo real por insumo cat=1 (movimentacoes_estoque) ===');
  let totalReal = 0;
  q4.forEach(r => {
    console.log(`  id=${r.id} ${r.nome}: entrada=${Number(r.total_entrada).toFixed(2)} saida=${Number(r.total_saida).toFixed(2)} saldo=${Number(r.saldo_real).toFixed(2)}`);
    totalReal += Number(r.saldo_real);
  });
  console.log('  => TOTAL REAL:', totalReal.toFixed(2));

  // A tela também mostra "Saldo Directus" no Catálogo (ins.saldo de vw_insumos_directus)
  // Verificar o que essa view traz
  const q5 = await sql`
    SELECT viewname, pg_get_viewdef('alissonerp.' || viewname, true) AS def
    FROM pg_views WHERE schemaname = 'alissonerp' AND viewname = 'vw_insumos_directus'
  `;
  if (q5.length > 0) {
    console.log('\n=== vw_insumos_directus definição ===');
    console.log(q5[0].def);
  } else {
    console.log('\n=== vw_insumos_directus: NÃO EXISTE ===');
  }

  await sql.end();
}
run().catch(e => { console.error(e.message); sql.end(); });
