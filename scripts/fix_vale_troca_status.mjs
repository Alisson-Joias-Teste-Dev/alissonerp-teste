import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

// Fix: pagamentos Vale-Troca com status 'aprovado' -> 'confirmado'
const fixed = await sql`
  UPDATE alissonerp.pagamentos_venda
  SET status = 'confirmado', data_confirmacao = COALESCE(data_confirmacao, now())
  WHERE forma = 'Vale-Troca' AND status = 'aprovado'
  RETURNING id, venda_id, valor
`;
console.log('Pagamentos corrigidos:', fixed);

// Recalcular total_pago nas vendas afetadas
const vendaIds = [...new Set(fixed.map(r => r.venda_id))];
for (const vid of vendaIds) {
  const [res] = await sql`
    UPDATE alissonerp.vendas_erp v
    SET total_pago = (
      SELECT COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado'), 0)
      FROM alissonerp.pagamentos_venda p WHERE p.venda_id = v.id
    )
    WHERE v.id = ${vid}
    RETURNING id, total_pago
  `;
  console.log('Venda atualizada:', res);
}

await sql.end();
