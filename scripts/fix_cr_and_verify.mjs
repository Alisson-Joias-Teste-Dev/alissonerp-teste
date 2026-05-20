import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== FINALIZANDO CORRECAO: contas_receber + verificacao ===\n');

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.sync_ativo', 'true', true)`;

    // Fix contas_receber with wrong value
    const crResult = await tx`
      UPDATE alissonerp.contas_receber cr
      SET
        situacao = 'cancelado',
        obs = COALESCE(obs, '') || ' [Correcao total_venda ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']',
        updated_at = now()
      FROM alissonerp.vendas_erp ve
      WHERE cr.venda_erp_id = ve.id
        AND ve.public_venda_id IS NOT NULL
        AND cr.situacao IN ('pendente', 'pago')
        AND ABS(cr.valor - ve.total_venda) > 0.01
    `;
    console.log(`Contas_receber canceladas: ${crResult.count}`);
  });

  // Final verification
  console.log('\n=== VERIFICACAO FINAL ===');
  
  const [dupCheck] = await sql`
    SELECT 
      COUNT(*)::int as total,
      COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, '')))::int as distincts
    FROM alissonerp.itens_venda_erp
    WHERE produto_id IS NOT NULL
  `;
  const dups = dupCheck.total - dupCheck.distincts;
  console.log(`Itens: total=${dupCheck.total}, distinct=${dupCheck.distincts}, duplicatas=${dups}`);

  const [divCheck] = await sql`
    SELECT 
      COUNT(*)::int as cnt,
      COALESCE(SUM(ABS(ve.total_venda - pv.total_venda)), 0)::numeric as soma
    FROM alissonerp.vendas_erp ve
    JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda - pv.total_venda) > 0.01
  `;
  console.log(`Vendas divergentes: ${divCheck.cnt}, soma divergencia: R$${Number(divCheck.soma).toFixed(2)}`);

  if (dups === 0 && divCheck.cnt === 0) {
    console.log('\n✅ TUDO CORRETO!');
  } else {
    if (dups > 0) console.log(`\n⚠️ Ainda ha ${dups} duplicatas.`);
    if (divCheck.cnt > 0) console.log(`⚠️ Ainda ha ${divCheck.cnt} vendas com divergencia.`);
  }

  await sql.end();
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
