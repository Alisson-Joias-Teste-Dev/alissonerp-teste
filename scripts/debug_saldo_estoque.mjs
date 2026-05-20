import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

const produtoId = 1501019;

// Todas as movimentações do produto
const movs = await sql`
  SELECT tipo, quantidade, motivo, referencia_tipo, observacao, created_at
  FROM alissonerp.movimentacoes_estoque_comercial
  WHERE produto_id = ${produtoId}
  ORDER BY created_at DESC
  LIMIT 20
`;
console.log('MOVIMENTAÇÕES produto 1501019:');
movs.forEach(m => console.log(` ${m.tipo} ${m.quantidade} | ${m.motivo} | ${m.observacao} | ${m.created_at}`));

// Saldo calculado
const [saldo] = await sql`
  SELECT
    SUM(CASE WHEN tipo='entrada' THEN quantidade ELSE -quantidade END) AS saldo_calculado
  FROM alissonerp.movimentacoes_estoque_comercial
  WHERE produto_id = ${produtoId}
`;
console.log('\nSALDO CALCULADO:', saldo?.saldo_calculado);

// Ver se existe view de saldo
const views = await sql`
  SELECT table_name FROM information_schema.views
  WHERE table_schema='alissonerp' AND table_name ILIKE '%saldo%estoque%comercial%'
`;
console.log('\nVIEWS saldo:', views);

// Tentar a view diretamente
try {
  const [s] = await sql`SELECT * FROM alissonerp.vw_saldo_estoque_comercial WHERE produto_id = ${produtoId} LIMIT 5`;
  console.log('\nvw_saldo_estoque_comercial:', s);
} catch(e) { console.log('view não encontrada:', e.message); }

await sql.end();
