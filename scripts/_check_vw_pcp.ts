import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres',{max:1,connect_timeout:15});
async function main() {
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='vw_pcp_erp' ORDER BY ordinal_position`;
  console.log('VW_PCP_ERP columns:');
  for (const c of cols) console.log(' ', c.column_name, c.data_type);
  
  const rows = await sql`SELECT etapas_cod, etapas, count(*)::int as qtd FROM alissonerp.vw_pcp_erp WHERE etapas_cod <> 'concluido' GROUP BY etapas_cod, etapas ORDER BY qtd DESC`;
  console.log('\nETAPAS (nao concluidas):');
  for (const r of rows) console.log(' ', r.etapas_cod, '-', r.etapas, '-', r.qtd);

  await sql.end();
}
main().catch(e=>console.error(e.message));
