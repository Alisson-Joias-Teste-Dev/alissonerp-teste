import postgres from 'postgres';
import { readFileSync } from 'fs';

const DB = process.env.DATABASE_URL || process.argv[2];
const FILE = process.argv[3] || 'supabase/migrations/202_cofre_ouro_rastreio.sql';

if (!DB) {
  console.error('Uso: DATABASE_URL=<url> node scripts/run_migration_202.mjs');
  console.error('Ou:  node scripts/run_migration_202.mjs <db-url>');
  process.exit(1);
}

async function main() {
  console.log(`Conectando a ${DB.split('@')[1]}...`);
  const sql = postgres(DB, { max: 1, connect_timeout: 15 });

  try {
    const sqlContent = readFileSync(FILE, 'utf8');
    console.log(`Executando ${FILE} (${sqlContent.length} bytes)...`);

    await sql.unsafe(sqlContent);
    console.log('Migration 202 executada com sucesso!');

    // Lista o que foi criado
    const baixas = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'alissonerp' AND table_name IN ('cofre_ouro_baixas','cofre_ouro_rastreios') ORDER BY table_name`;
    console.log(`\nTabelas criadas: ${baixas.length}`);
    for (const t of baixas) console.log(`  - ${t.table_name}`);

    const views = await sql`SELECT table_name FROM information_schema.views WHERE table_schema = 'alissonerp' AND table_name = 'vw_cofre_ouro_disponivel'`;
    console.log(`Views criadas: ${views.length}`);

    const trigs = await sql`SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%' AND tgname LIKE '%cofre%' OR tgname LIKE '%rastreio%'`;
    console.log(`Triggers encontrados: ${trigs.length}`);
    for (const t of trigs) console.log(`  - ${t.tgname}`);
  } catch (err) {
    console.error('ERRO:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
