// Timeline completa do protocolo 170 e 171 (da ordem C-1707)
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // Protocolos ligados à ordem
  console.log('=== PROTOCOLOS 170 e 171 (Ordem C-1707) ===\n');
  // Primeiro pega só o * sem join pra ver quais colunas tem
  const protos = await sql`
    SELECT * FROM alissonerp.protocolos WHERE id IN (170, 171) ORDER BY id
  `;
  protos.forEach(p => {
    console.log(`── Protocolo #${p.id} ──`);
    Object.entries(p).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') console.log(`  ${k}: ${v}`);
    });
    console.log();
  });

  // Timeline detalhada (se existir tabela de etapas/timeline)
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp'
      AND (table_name ILIKE '%timeline%' OR table_name ILIKE '%etapa%' OR table_name ILIKE '%historico%')
    ORDER BY table_name
  `;
  console.log('=== Tabelas timeline/etapa/historico ===');
  tables.forEach(t => console.log(' ', t.table_name));
} finally {
  await sql.end();
}
