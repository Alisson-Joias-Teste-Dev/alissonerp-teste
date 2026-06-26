import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres',{max:1,connect_timeout:15});
async function main() {
  const r = await sql`SELECT o.status, count(*)::int as qtd FROM alissonerp.pcp p JOIN alissonerp.ordens o ON o.id = p.ordem_id WHERE p.data_conclusao IS NULL GROUP BY o.status ORDER BY qtd DESC`;
  console.log('PCP ativos:');
  for (const s of r) console.log(' ', s.status, '-', s.qtd);
  const t = await sql`SELECT count(*)::int as t FROM alissonerp.pcp WHERE data_conclusao IS NULL`;
  console.log('Total:', t[0].t);
  await sql.end();
}
main().catch(e=>console.error(e.message));
