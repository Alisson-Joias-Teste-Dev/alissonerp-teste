// Apply migration 136: unaccent extension
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 136: UNACCENT EXTENSION ===\n');

try {
  console.log('▶ CREATE EXTENSION IF NOT EXISTS unaccent');
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`;
  console.log('  ✅ Extension created (or already existed)');

  // Validação
  const [ext] = await sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'unaccent'`;
  if (ext) {
    console.log(`\n✅ unaccent ${ext.extversion} instalada`);
  } else {
    console.log('\n❌ ERRO: unaccent não foi criada');
    process.exit(1);
  }

  // Teste prático
  console.log('\n── Testes ──');
  const [t1] = await sql`SELECT unaccent('João Maria Çé') AS r`;
  console.log(`  unaccent('João Maria Çé') = '${t1.r}'`);

  // Busca 'Joao' no vw_pcp_erp
  const r2 = await sql`
    SELECT cliente_nome FROM alissonerp.vw_pcp_erp
    WHERE unaccent(cliente_nome) ILIKE unaccent(${'%Joao%'})
    LIMIT 5
  `;
  console.log(`\n  Busca 'Joao' com unaccent: ${r2.length} resultado(s)`);
  r2.forEach(r => console.log(`    - ${r.cliente_nome}`));

  const r3 = await sql`
    SELECT cliente_nome FROM alissonerp.vw_ordens_completa
    WHERE unaccent(cliente_nome) ILIKE unaccent(${'%Joao%'})
    LIMIT 5
  `;
  console.log(`\n  Busca 'Joao' em vw_ordens_completa com unaccent: ${r3.length} resultado(s)`);
  r3.forEach(r => console.log(`    - ${r.cliente_nome}`));

  console.log('\n=== MIGRATION 136 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
