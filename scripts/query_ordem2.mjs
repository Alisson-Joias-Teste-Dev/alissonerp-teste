// Timeline de protocolo da ordem 1707
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Descobrir as tabelas de protocolo
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp' AND table_name ILIKE '%protocolo%'
    ORDER BY table_name
  `;
  console.log('Tabelas protocolo:', tables.map(t => t.table_name).join(', '));

  // 2. Timeline por ordem_id
  for (const t of tables) {
    console.log(`\n── ${t.table_name} (ordem 1707) ──`);
    try {
      const rows = await sql.unsafe(`
        SELECT * FROM alissonerp.${t.table_name}
        WHERE ordem_id = 1707
        ORDER BY id DESC LIMIT 10
      `);
      if (rows.length === 0) {
        console.log('  (vazio)');
      } else {
        rows.forEach(r => console.log(' ', JSON.stringify(r)));
      }
    } catch (e) {
      console.log(`  (sem coluna ordem_id ou outro erro: ${e.message})`);
    }
  }

  // 3. Ver também alissonerp.servicos vinculado
  console.log('\n── alissonerp.servicos (ordem 1707) ──');
  try {
    const servicos = await sql`
      SELECT id, ordem_id, setor_id, status, data_inicio, data_conclusao, observacoes
      FROM alissonerp.servicos
      WHERE ordem_id = 1707
      ORDER BY id DESC LIMIT 5
    `;
    servicos.forEach(s => console.log(' ', JSON.stringify(s)));
    if (servicos.length === 0) console.log('  (vazio)');
  } catch (e) { console.log('  erro:', e.message); }
} finally {
  await sql.end();
}
