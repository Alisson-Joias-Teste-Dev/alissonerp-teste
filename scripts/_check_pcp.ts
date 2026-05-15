import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', {max:1,connect_timeout:15});
async function main() {
  // PCP records com dados da ordem
  const pcp = await sql`
    SELECT p.id, p.ordem_id, o.numero_ordem, o.situacao, o.status,
           p.bloqueado, p.operador, p.local_atual, p.data_conclusao
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    ORDER BY o.data_entrega ASC NULLS LAST
    LIMIT 10
  `;
  console.log('PCP + ORDENS (10):');
  for (const r of pcp) console.log(`  OP ${r.numero_ordem}: situacao=${r.situacao} status=${r.status} bloqueado=${r.bloqueado} operador=${r.operador}`);

  const count = await sql`SELECT count(*)::int as total FROM alissonerp.pcp`;
  console.log(`\nTotal PCP records: ${count[0].total}`);

  // PCP em andamento (sem data_conclusao)
  const ativos = await sql`SELECT count(*)::int as total FROM alissonerp.pcp WHERE data_conclusao IS NULL`;
  console.log(`PCP ativos (sem conclusao): ${ativos[0].total}`);

  // PCP com ordem situations
  const stats = await sql`
    SELECT o.situacao, o.status, count(*)::int as qtd
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    GROUP BY o.situacao, o.status
    ORDER BY qtd DESC
  `;
  console.log('\nPCP por situacao/status:');
  for (const s of stats) console.log(`  ${s.situacao}/${s.status}: ${s.qtd}`);
  
  await sql.end();
}
main().catch(e=>console.error(e.message));
