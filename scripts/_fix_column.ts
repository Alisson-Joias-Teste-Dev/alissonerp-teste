import postgres from 'postgres';

const DB = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB, { max: 1, connect_timeout: 15 });

async function main() {
  const c = await sql`SELECT column_name, character_maximum_length FROM information_schema.columns WHERE table_schema='agentes' AND table_name='conversas' AND column_name='prompt_versao'`;
  console.log('antes:', JSON.stringify(c[0]));

  await sql`ALTER TABLE agentes.conversas ALTER COLUMN prompt_versao TYPE VARCHAR(64)`;
  await sql`ALTER TABLE agentes.skills ALTER COLUMN prompt_versao TYPE VARCHAR(64)`;
  
  const c2 = await sql`SELECT column_name, character_maximum_length FROM information_schema.columns WHERE table_schema='agentes' AND table_name='conversas' AND column_name='prompt_versao'`;
  console.log('depois:', JSON.stringify(c2[0]));

  await sql.end();
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
