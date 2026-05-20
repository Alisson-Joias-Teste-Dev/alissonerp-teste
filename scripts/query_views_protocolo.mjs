// Definição das views e teste com C-1707
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const views = ['vw_ordens_prontas_ida', 'vw_ordens_prontas_volta'];
  for (const v of views) {
    console.log(`\n=== Definição de alissonerp.${v} ===`);
    try {
      const [def] = await sql`SELECT pg_get_viewdef(${'alissonerp.' + v}::regclass, true) AS def`;
      console.log(def.def);
    } catch (e) { console.log('  erro:', e.message); }
  }

  // Testar se a ordem 1707 aparece nas views
  console.log('\n=== 1707 em vw_ordens_prontas_ida? ===');
  try {
    const r = await sql`SELECT * FROM alissonerp.vw_ordens_prontas_ida WHERE id = 1707`;
    console.log(r.length === 0 ? '  ❌ NÃO aparece' : '  ✅ Aparece: ' + JSON.stringify(r[0]));
  } catch (e) { console.log('  erro:', e.message); }

  console.log('\n=== 1707 em vw_ordens_prontas_volta? ===');
  try {
    const r = await sql`SELECT * FROM alissonerp.vw_ordens_prontas_volta WHERE id = 1707`;
    console.log(r.length === 0 ? '  ❌ NÃO aparece' : '  ✅ Aparece: ' + JSON.stringify(r[0]));
  } catch (e) { console.log('  erro:', e.message); }
} finally {
  await sql.end();
}
