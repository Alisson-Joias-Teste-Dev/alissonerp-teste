import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
try {
  const names = ['vendas_erp','itens_venda_erp','transferencias_estoque_comercial','devolucoes_venda','devolucoes_itens','locais_estoque','vendedores'];
  for (const n of names) {
    const rows = await sql`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = ${n}
      ORDER BY table_schema
    `;
    console.log(`${n}: ${rows.map(r => r.table_schema).join(', ') || 'NOT FOUND'}`);
  }
} finally { await sql.end(); }
