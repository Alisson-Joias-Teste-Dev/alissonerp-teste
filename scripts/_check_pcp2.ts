import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres',{max:1,connect_timeout:15});
async function main() {
  console.log('STATUS x SITUACAO x BLOQUEADO x LOCAL:');
  const r = await sql`SELECT o.status, o.situacao, p.bloqueado, p.local_atual, p.operador IS NOT NULL as tem_operador, count(*)::int as qtd
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.data_conclusao IS NULL
    GROUP BY o.status, o.situacao, p.bloqueado, p.local_atual, tem_operador
    ORDER BY qtd DESC`;
  for (const s of r) console.log(`  status=${s.status} sit=${s.situacao} bloqueado=${s.bloqueado} local=${s.local_atual} operador=${s.tem_operador} => ${s.qtd}`);

  console.log('\nDistinct local_atual values:');
  const loc = await sql`SELECT DISTINCT local_atual FROM alissonerp.pcp WHERE data_conclusao IS NULL`;
  for (const l of loc) console.log(' ', l.local_atual);

  console.log('\nPCP NAO ATRIBUÍDOS (sem operador, em_andamento):');
  const nr = await sql`SELECT count(*)::int as qtd FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.data_conclusao IS NULL AND p.operador IS NULL AND o.status = 'em_andamento'`;
  console.log(' ', nr[0].qtd);

  console.log('\nPCP ATRIBUÍDOS (com operador, em_andamento):');
  const ar = await sql`SELECT count(*)::int as qtd FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    WHERE p.data_conclusao IS NULL AND p.operador IS NOT NULL AND o.status = 'em_andamento'`;
  console.log(' ', ar[0].qtd);

  await sql.end();
}
main().catch(e=>console.error(e.message));
