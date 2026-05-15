import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres',{max:1,connect_timeout:15});
async function main() {
  try {
    const pp = await sql`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='produto_processo'`;
    console.log('PRODUTO_PROCESSO:');
    for (const c of pp) console.log(' ',c.column_name,c.data_type);
    
    const pr = await sql`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos' ORDER BY ordinal_position`;
    console.log('\nPRODUTOS (public):');
    for (const c of pr) console.log(' ',c.column_name,c.data_type);
    
    const vw = await sql`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='vw_ordem_detalhe'`;
    console.log('\nVW_ORDEM_DETALHE:');
    for (const c of vw) console.log(' ',c.column_name,c.data_type);
    
    const vws = await sql`SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='vw_saldo_estoque'`;
    console.log('\nVW_SALDO_ESTOQUE:');
    for (const c of vws) console.log(' ',c.column_name,c.data_type);
  } catch(e:unknown) { console.error((e as Error).message); }
  await sql.end();
}
main();
