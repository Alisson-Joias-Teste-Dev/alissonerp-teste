// Consulta localização e status da ordem C-1707
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const numeroOrdem = process.argv[2] ?? 'C-1707';
  console.log(`=== ORDEM ${numeroOrdem} ===\n`);

  // 1. Dados principais via view
  const [o] = await sql`
    SELECT
      id, numero_ordem, numero_pedido, situacao, status, rota, tipo_ordem,
      setor_id, setor_nome, deposito_id, deposito_nome,
      vendedor_nome, cliente_nome,
      peso_metal_negociado, data_entrega, data_conclusao,
      date_created, date_updated
    FROM alissonerp.vw_ordens_completa
    WHERE numero_ordem = ${numeroOrdem}
  `;

  if (!o) {
    console.log('❌ Ordem não encontrada');
    process.exit(0);
  }

  console.log(`ID:             ${o.id}`);
  console.log(`Número Pedido:  ${o.numero_pedido ?? '—'}`);
  console.log(`Tipo Ordem:     ${o.tipo_ordem}`);
  console.log(`Rota:           ${o.rota}`);
  console.log(`Status:         ${o.status}`);
  console.log(`Situação:       ${o.situacao}`);
  console.log(`Setor atual:    ${o.setor_nome ?? '—'} (id ${o.setor_id ?? '—'})`);
  console.log(`Depósito atual: ${o.deposito_nome ?? '—'} (id ${o.deposito_id ?? '—'})`);
  console.log(`Cliente:        ${o.cliente_nome ?? '—'}`);
  console.log(`Vendedor:       ${o.vendedor_nome ?? '—'}`);
  console.log(`Peso metal neg: ${o.peso_metal_negociado ?? '—'}g`);
  console.log(`Data entrega:   ${o.data_entrega ?? '—'}`);
  console.log(`Data conclusão: ${o.data_conclusao ?? '—'}`);
  console.log(`Criada em:      ${o.date_created}`);
  console.log(`Atualizada em:  ${o.date_updated}`);

  // 2. PCP — etapa atual se for rota PCP
  if (o.rota === 'PCP') {
    console.log('\n── PCP ──');
    const pcpRows = await sql`
      SELECT p.id, p.etapas, p.setor_id, s.nome AS setor_nome,
             p.operador_id, u.nome AS operador_nome,
             p.data_entrada, p.data_saida, p.peso_entrada, p.peso_saida
      FROM alissonerp.pcp p
      LEFT JOIN alissonerp.setores s ON s.id = p.setor_id
      LEFT JOIN alissonerp.usuarios u ON u.id = p.operador_id
      WHERE p.ordem_id = ${o.id}
      ORDER BY p.id DESC
      LIMIT 10
    `;
    if (pcpRows.length === 0) {
      console.log('  (sem registros em pcp)');
    } else {
      pcpRows.forEach(p => {
        console.log(`  #${p.id} | ${p.etapas} | setor: ${p.setor_nome ?? '—'} | operador: ${p.operador_nome ?? '—'} | entrada: ${p.data_entrada ?? '—'} | saida: ${p.data_saida ?? '—'}`);
      });
    }

    // Distribuicao ativa
    console.log('\n── Distribuição ativa (se houver) ──');
    const dist = await sql`
      SELECT d.id, d.data_abertura, d.data_fechamento, d.ourives_id,
             u.nome AS ourives_nome, d.status
      FROM alissonerp.distribuicoes d
      JOIN alissonerp.distribuicao_ordens dord ON dord.distribuicao_id = d.id
      LEFT JOIN alissonerp.usuarios u ON u.id = d.ourives_id
      WHERE dord.ordens_id = ${o.id}
      ORDER BY d.id DESC
      LIMIT 5
    `;
    if (dist.length === 0) {
      console.log('  (sem distribuição)');
    } else {
      dist.forEach(d => {
        console.log(`  #${d.id} | ${d.status} | ourives: ${d.ourives_nome ?? '—'} | abertura: ${d.data_abertura} | fechamento: ${d.data_fechamento ?? '—'}`);
      });
    }
  }

  // 3. Protocolo — timeline se for rota Protocolo
  if (o.rota === 'Protocolo') {
    console.log('\n── PROTOCOLO ──');
    const protoRows = await sql`
      SELECT p.id, p.tipo, p.setor_origem, s1.nome AS setor_origem_nome,
             p.setor_destino, s2.nome AS setor_destino_nome,
             p.status, p.data_envio, p.data_recebimento
      FROM alissonerp.protocolo p
      LEFT JOIN alissonerp.setores s1 ON s1.id = p.setor_origem
      LEFT JOIN alissonerp.setores s2 ON s2.id = p.setor_destino
      WHERE p.ordem_id = ${o.id}
      ORDER BY p.id DESC
      LIMIT 10
    `;
    if (protoRows.length === 0) {
      console.log('  (sem registros em protocolo)');
    } else {
      protoRows.forEach(p => {
        console.log(`  #${p.id} | ${p.tipo} | ${p.setor_origem_nome ?? '?'} -> ${p.setor_destino_nome ?? '?'} | status: ${p.status} | envio: ${p.data_envio ?? '—'} | receb: ${p.data_recebimento ?? '—'}`);
      });
    }
  }

  // 4. Itens da ordem
  console.log('\n── ITENS ──');
  const itens = await sql`
    SELECT id, nome_produto, quantidade, peso_estimado, observacao
    FROM alissonerp.itens_ordem
    WHERE ordem_id = ${o.id}
    ORDER BY id
  `;
  if (itens.length === 0) {
    console.log('  (sem itens)');
  } else {
    itens.forEach(it => {
      console.log(`  ${it.nome_produto} | qty: ${it.quantidade} | peso: ${it.peso_estimado ?? '—'}g`);
    });
  }

} finally {
  await sql.end();
}
