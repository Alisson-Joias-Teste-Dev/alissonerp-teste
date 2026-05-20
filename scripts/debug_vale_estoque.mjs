import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

// 1. Vale VT-00001
const [vale] = await sql`SELECT * FROM alissonerp.vale_troca WHERE numero = 'VT-00001'`;
console.log('VALE:', vale);

// 2. Devolução vinculada
if (vale?.devolucao_id) {
  const [dev] = await sql`SELECT * FROM alissonerp.devolucoes_venda WHERE id = ${vale.devolucao_id}`;
  console.log('\nDEVOLUCAO:', dev);

  // 3. Itens da devolução
  const itens = await sql`SELECT * FROM alissonerp.devolucoes_itens WHERE devolucao_id = ${vale.devolucao_id}`;
  console.log('\nITENS:', itens);

  // 4. Movimentações de estoque geradas
  const movs = await sql`SELECT * FROM alissonerp.movimentacoes_estoque_comercial WHERE devolucao_id = ${vale.devolucao_id}`;
  console.log('\nMOVIMENTAÇÕES ESTOQUE:', movs);
}

await sql.end();
