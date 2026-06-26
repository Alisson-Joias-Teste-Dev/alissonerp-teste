import postgres from 'postgres';

const DB = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB, { max: 1, connect_timeout: 15 });

async function main() {
  try {
    console.log('OK');
    
    const vws = await sql`SELECT table_name FROM information_schema.views WHERE table_schema='alissonerp' AND (table_name LIKE '%' || 'ordem' || '%' OR table_name LIKE '%' || 'saldo' || '%' OR table_name LIKE '%' || 'produto' || '%') ORDER BY table_name`;
    console.log('VIEWS relacionadas:');
    for (const v of vws) console.log(' ', v.table_name);

const pcp = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='pcp' ORDER BY ordinal_position`;
    console.log('\nPCP:');
    for (const c of pcp) console.log(`  ${c.column_name} ${c.data_type}`);

const ap = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='apontamentos_pcp' ORDER BY ordinal_position`;
    console.log('\nAPONTAMENTOS_PCP:');
    for (const c of ap) console.log(`  ${c.column_name} ${c.data_type}`);

const pp = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='produto_processo' ORDER BY ordinal_position`;
    console.log('\nPRODUTO_PROCESSO:');
    for (const c of pp) console.log(`  ${c.column_name} ${c.data_type}`);

const ordens = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='ordens' ORDER BY ordinal_position`;
    console.log('\nORDENS:');
    for (const c of ordens) console.log(`  ${c.column_name} ${c.data_type}`);
  } catch (e: any) {
    console.error('ERR:', e.message);
  }
  await sql.end();
}
main();
