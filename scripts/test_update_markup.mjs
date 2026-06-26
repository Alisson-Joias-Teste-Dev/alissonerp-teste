import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // Tentar UPDATE no markup de 1 produto aleatorio — transacao com rollback
  await sql.begin(async tx => {
    const [p] = await tx`SELECT id_produto, markup FROM public.produtos WHERE markup IS NOT NULL LIMIT 1`;
    console.log('Produto amostra:', p);
    const r = await tx`UPDATE public.produtos SET markup = markup WHERE id_produto = ${p.id_produto}`;
    console.log('UPDATE ok, count:', r.count);
    throw new Error('ROLLBACK_INTENCIONAL');
  }).catch(e => {
    if (e.message === 'ROLLBACK_INTENCIONAL') console.log('Rollback ok — UPDATE tem permissao.');
    else throw e;
  });
} catch (err) {
  console.error('ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
