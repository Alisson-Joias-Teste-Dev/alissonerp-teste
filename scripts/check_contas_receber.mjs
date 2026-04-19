import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Estado atual de contas_receber ===\n');

console.log('── Totais por situação ──');
const stats = await sql`
  SELECT situacao, COUNT(*)::int AS qtd, SUM(valor)::numeric AS total
  FROM alissonerp.contas_receber
  GROUP BY situacao
  ORDER BY situacao
`;
stats.forEach(s => console.log(`  ${s.situacao}: ${s.qtd} registros — total R$ ${Number(s.total).toFixed(2)}`));

console.log('\n── Últimas 10 CRs (qualquer situação) ──');
const crs = await sql`
  SELECT cr.id, cr.descricao, cr.valor, cr.situacao,
         cr.data_vencimento, cr.data_recebimento, cr.categoria,
         cr.venda_erp_id, cr.cliente_nome, cr.created_at
  FROM alissonerp.contas_receber cr
  ORDER BY cr.id DESC
  LIMIT 10
`;
crs.forEach(c => {
  console.log(`  CR#${c.id} | R$ ${Number(c.valor).toFixed(2)} | ${c.situacao} | venda_erp=${c.venda_erp_id ?? '—'}`);
  console.log(`    "${c.descricao}" | cliente=${c.cliente_nome ?? '—'}`);
  console.log(`    vencimento=${c.data_vencimento} recebimento=${c.data_recebimento}`);
  console.log(`    categoria=${c.categoria} created=${c.created_at?.toISOString()}`);
});

console.log('\n── CRs vinculadas a vendas_erp MP recentes ──');
const vinc = await sql`
  SELECT cr.id AS cr_id, cr.situacao AS cr_situacao, cr.valor AS cr_valor, cr.data_recebimento,
         v.id AS venda_id, v.numero_venda, v.situacao AS venda_situacao, v.total_venda,
         p.gateway, p.status AS pag_status, p.data_confirmacao
  FROM alissonerp.contas_receber cr
  JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
  LEFT JOIN alissonerp.pagamentos_venda p
    ON p.venda_id = v.id AND p.gateway LIKE 'Mercado Pago%'
  WHERE cr.venda_erp_id IS NOT NULL
    AND p.id IS NOT NULL
  ORDER BY cr.id DESC
  LIMIT 10
`;
if (vinc.length === 0) {
  console.log('  (nenhuma CR vinculada a venda MP)');
} else {
  vinc.forEach(v => {
    console.log(`  CR#${v.cr_id} ${v.cr_situacao} R$${v.cr_valor} ↔ venda#${v.venda_id} (${v.numero_venda}) ${v.venda_situacao}`);
    console.log(`    pagamento: ${v.gateway} ${v.pag_status} confirmado=${v.data_confirmacao?.toISOString?.() ?? '—'}`);
    console.log(`    CR recebimento=${v.data_recebimento}`);
  });
}

console.log('\n── View vw_resumo_financeiro ──');
try {
  const resumo = await sql`SELECT * FROM alissonerp.vw_resumo_financeiro LIMIT 10`;
  resumo.forEach(r => console.log(`  ${JSON.stringify(r)}`));
} catch (e) {
  console.log(`  ⚠️ ${e.message}`);
}

await sql.end();
