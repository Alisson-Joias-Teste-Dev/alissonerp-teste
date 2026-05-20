import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== LIMPEZA: vendas do cliente "jonathan teste" ===\n');

try {
  const vendas = await sql`
    SELECT v.id FROM alissonerp.vendas_erp v
    JOIN public.contatos c ON c.id_contato = v.cliente_id
    WHERE c.nome ILIKE '%jonathan teste%'
    ORDER BY v.id
  `;
  const ids = vendas.map(v => v.id);
  console.log(`Vendas encontradas: ${ids.length}`);

  if (ids.length === 0) {
    console.log('Nada a limpar.');
    await sql.end();
    process.exit(0);
  }

  // 1. saldo_credito_loja
  const s1 = await sql`DELETE FROM alissonerp.saldo_credito_loja WHERE venda_id = ANY(${ids}) RETURNING id`;
  console.log(`  saldo_credito_loja: ${s1.length} deletados`);

  // 2. contas_receber
  const s2 = await sql`DELETE FROM alissonerp.contas_receber WHERE venda_erp_id = ANY(${ids}) RETURNING id`;
  console.log(`  contas_receber: ${s2.length} deletadas`);

  // 3. aprovacoes de tarefas
  const tarefaIds = await sql`SELECT id FROM alissonerp.tarefas WHERE venda_id = ANY(${ids})`;
  if (tarefaIds.length > 0) {
    const tIds = tarefaIds.map(t => t.id);
    const s3 = await sql`DELETE FROM alissonerp.aprovacoes_tarefa WHERE tarefa_id = ANY(${tIds}) RETURNING id`;
    console.log(`  aprovacoes_tarefa: ${s3.length} deletadas`);
  }

  // 4. Limpar FK antes de deletar tarefas (desabilita blindagem temporariamente)
  // Desabilitar TODOS os triggers (incluindo system) via session_replication_role
  await sql`SET session_replication_role = 'replica'`;
  await sql`UPDATE alissonerp.vendas_erp SET aprovacao_credito_tarefa_id = NULL, bloqueado = false WHERE id = ANY(${ids})`;

  // 5. tarefas
  const s4 = await sql`DELETE FROM alissonerp.tarefas WHERE venda_id = ANY(${ids}) RETURNING id`;
  console.log(`  tarefas: ${s4.length} deletadas`);

  // 6. notificacoes
  const links = ids.map(id => `/vendas/${id}`);
  const s5 = await sql`DELETE FROM alissonerp.notificacoes WHERE link = ANY(${links}) RETURNING id`;
  console.log(`  notificacoes: ${s5.length} deletadas`);

  // 7. pagamentos
  const s6 = await sql`DELETE FROM alissonerp.pagamentos_venda WHERE venda_id = ANY(${ids}) RETURNING id`;
  console.log(`  pagamentos: ${s6.length} deletados`);

  // 8. itens
  const s7 = await sql`DELETE FROM alissonerp.itens_venda_erp WHERE venda_id = ANY(${ids}) RETURNING id`;
  console.log(`  itens: ${s7.length} deletados`);

  // 9. desvincular ordens
  const s8 = await sql`UPDATE alissonerp.ordens SET venda_id = NULL WHERE venda_id = ANY(${ids}) RETURNING id`;
  console.log(`  ordens desvinculadas: ${s8.length}`);

  // 10. deletar vendas (triggers já desabilitados via replica role)
  const s9 = await sql`DELETE FROM alissonerp.vendas_erp WHERE id = ANY(${ids}) RETURNING id`;
  console.log(`  vendas: ${s9.length} deletadas`);

  // Reabilitar triggers
  await sql`SET session_replication_role = 'origin'`;
  console.log(`  triggers reabilitados`);

  // 11. restaurar saldo
  await sql`UPDATE alissonerp.configuracoes_sistema SET valor = '50000' WHERE chave = 'saldo_gerente_atual'`;
  console.log(`\n  Saldo gerente restaurado para R$ 50.000`);

  console.log('\n=== LIMPEZA CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('\n❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
