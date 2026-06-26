const postgres = require('C:\\Users\\jonat\\fabricaAJ\\node_modules\\postgres');
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres');

async function run() {
  // Q5: definição das views
  const q5 = await sql`
    SELECT viewname, pg_get_viewdef(schemaname || '.' || viewname, true) AS def
    FROM pg_views WHERE schemaname = 'alissonerp'
    AND (viewname LIKE '%estoque%' OR viewname LIKE '%saldo%')
    ORDER BY viewname
  `;
  q5.forEach(r => {
    console.log('\n=== VIEW:', r.viewname, '===');
    console.log(r.def);
  });

  // Q6: saldo por movimentacoes (tentar ambas tabelas)
  try {
    const q6a = await sql`
      SELECT i.nome,
        COALESCE(SUM(CASE WHEN me.tipo = 'entrada' THEN me.quantidade ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN me.tipo = 'saida' THEN me.quantidade ELSE 0 END), 0) AS total_saidas,
        COALESCE(SUM(CASE WHEN me.tipo = 'entrada' THEN me.quantidade ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN me.tipo = 'saida' THEN me.quantidade ELSE 0 END), 0) AS saldo_real
      FROM alissonerp.insumos i
      LEFT JOIN alissonerp.movimentacoes_estoque me ON me.insumo_id = i.id
      WHERE i.categoria_id = 1
      GROUP BY i.id, i.nome ORDER BY i.id
    `;
    console.log('\n=== Q6 movimentacoes_estoque ===');
    q6a.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) {
    console.log('\nQ6 movimentacoes_estoque falhou:', e.message);
  }

  try {
    const q6b = await sql`
      SELECT i.nome,
        COALESCE(SUM(CASE WHEN ce.tipo = 'entrada' THEN ce.quantidade ELSE 0 END), 0) AS total_entradas,
        COALESCE(SUM(CASE WHEN ce.tipo = 'saida' THEN ce.quantidade ELSE 0 END), 0) AS total_saidas,
        COALESCE(SUM(CASE WHEN ce.tipo = 'entrada' THEN ce.quantidade ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN ce.tipo = 'saida' THEN ce.quantidade ELSE 0 END), 0) AS saldo_real
      FROM alissonerp.insumos i
      LEFT JOIN alissonerp.controle_estoque ce ON ce.insumo_id = i.id
      WHERE i.categoria_id = 1
      GROUP BY i.id, i.nome ORDER BY i.id
    `;
    console.log('\n=== Q6 controle_estoque ===');
    q6b.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) {
    console.log('\nQ6 controle_estoque falhou:', e.message);
  }

  await sql.end();
}
run().catch(e => { console.error(e.message); sql.end(); });
