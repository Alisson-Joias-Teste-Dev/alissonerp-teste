import postgres from 'postgres';
import { readFileSync } from 'fs';

const DB = process.argv[2] || 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const FILE = process.argv[3] || 'supabase/migrations/230_schema_agentes_inicial.sql';

async function main() {
  console.log(`Conectando a ${DB.split('@')[1]}...`);
  const sql = postgres(DB, { max: 1, connect_timeout: 15 });

  try {
    const sqlContent = readFileSync(FILE, 'utf8');
    console.log(`Executando ${FILE} (${sqlContent.length} bytes)...`);

    await sql.unsafe(sqlContent);

    console.log('Migration executada com sucesso!');

    const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'agentes' ORDER BY table_name`;
    console.log(`\nSchema agentes: ${tables.length} tabelas criadas`);
    for (const t of tables) console.log(`  - ${t.table_name}`);

    const seed = await sql`SELECT id, slug, nome FROM agentes.skills`;
    console.log(`\nSeed skills: ${seed.length} registro(s)`);
    for (const s of seed) console.log(`  - ${s.slug}: ${s.nome}`);
  } catch (err) {
    console.error('ERRO:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
