import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { max: 1, connect_timeout: 15 });

async function main() {
  console.log('LISTAR ORDENS PCP (padrão: em_andamento, ativos):\n');

  const rows = await sql`
    SELECT
      o.id, o.numero_ordem, o.situacao, o.status,
      o.cliente_id, o.peso_metal_negociado, o.data_entrega,
      p.id as pcp_id, p.bloqueado, p.operador,
      p.total_metal, p.retorno_metal, p.peso_final,
      p.quantidade, p.data_conclusao as pcp_data_conclusao,
      u.nome as operador_nome
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    LEFT JOIN alissonerp.usuarios u ON u.id = p.operador
    WHERE (o.situacao = 'criado' OR o.situacao = 'cancelado')
      AND o.status::text = 'em_andamento'
      AND p.data_conclusao IS NULL
    ORDER BY o.data_entrega ASC NULLS LAST
    LIMIT 10
  `;

  if (rows.length === 0) {
    console.log('Nenhuma ordem encontrada.');
  } else {
    for (const r of rows) {
      console.log(`OP ${r.numero_ordem}`);
      console.log(`  Situação: ${r.situacao} | Status: ${r.status}`);
      console.log(`  Operador: ${r.operador_nome ?? 'Não atribuído'}`);
      console.log(`  Metal: ${r.total_metal ?? 0}g | Peso final: ${r.peso_final ?? '-'}`);
      console.log(`  Data entrega: ${r.data_entrega ?? '-'}`);
      console.log(`  Bloqueado: ${r.bloqueado ? 'SIM' : 'não'}`);
      console.log('');
    }
  }

  console.log('---');
  console.log(`Total: ${rows.length} ordens`);

  await sql.end();
}
main().catch(e => console.error('ERRO:', e.message));
