// Onde a ordem 1707 aparece (pcp, servicos, transferencias)
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Linha em alissonerp.pcp?
  console.log('=== 1. alissonerp.pcp (ordem 1707) ===');
  const pcp = await sql`
    SELECT * FROM alissonerp.pcp WHERE ordem_id = 1707
  `;
  if (pcp.length === 0) console.log('  ❌ SEM LINHA em alissonerp.pcp');
  else pcp.forEach(p => console.log(' ', JSON.stringify(p)));

  // 2. Vw_pcp_erp?
  console.log('\n=== 2. vw_pcp_erp (ordem 1707) ===');
  try {
    const vw = await sql`
      SELECT * FROM alissonerp.vw_pcp_erp WHERE ordem_id = 1707
    `;
    if (vw.length === 0) console.log('  ❌ NÃO aparece em vw_pcp_erp');
    else vw.forEach(v => console.log(' ', JSON.stringify(v)));
  } catch (e) { console.log('  erro:', e.message); }

  // 3. alissonerp.servicos?
  console.log('\n=== 3. alissonerp.servicos (ordem 1707) ===');
  try {
    const servicos = await sql`SELECT * FROM alissonerp.servicos WHERE ordem_id = 1707`;
    if (servicos.length === 0) console.log('  ❌ SEM linha em servicos');
    else servicos.forEach(s => console.log(' ', JSON.stringify(s)));
  } catch (e) { console.log('  erro:', e.message); }

  // 4. transferencias_ordem?
  console.log('\n=== 4. alissonerp.transferencias_ordem (ordem 1707) ===');
  try {
    const t = await sql`SELECT * FROM alissonerp.transferencias_ordem WHERE ordem_id = 1707`;
    if (t.length === 0) console.log('  (vazio)');
    else t.forEach(r => console.log(' ', JSON.stringify(r)));
  } catch (e) { console.log('  erro:', e.message); }

  // 5. Outras tabelas potenciais: service_*
  console.log('\n=== 5. Tabelas relacionadas a service/fabrica ===');
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp'
      AND (table_name ILIKE '%service%' OR table_name ILIKE '%fabrica%' OR table_name ILIKE '%novas%')
    ORDER BY table_name
  `;
  tables.forEach(t => console.log(' ', t.table_name));

  // 6. vw_timeline_ordem
  console.log('\n=== 6. vw_timeline_ordem (ordem 1707) ===');
  try {
    const tl = await sql`
      SELECT * FROM alissonerp.vw_timeline_ordem WHERE ordem_id = 1707 ORDER BY data DESC LIMIT 20
    `;
    tl.forEach(r => console.log(' ', JSON.stringify(r)));
    if (tl.length === 0) console.log('  (vazio)');
  } catch (e) { console.log('  erro:', e.message); }

} finally {
  await sql.end();
}
