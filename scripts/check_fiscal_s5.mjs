import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });
try {
  // devolucoes_venda
  const d1 = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='devolucoes_venda' ORDER BY ordinal_position`;
  console.log('=== devolucoes_venda ===');
  d1.forEach(r => console.log(`  ${r.column_name} | ${r.data_type} | ${r.is_nullable}`));

  // devolucoes_itens
  const d2 = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='devolucoes_itens' ORDER BY ordinal_position`;
  console.log('=== devolucoes_itens ===');
  d2.forEach(r => console.log(`  ${r.column_name} | ${r.data_type} | ${r.is_nullable}`));

  // transferencias
  const d3 = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='transferencias_estoque_comercial' ORDER BY ordinal_position`;
  console.log('=== transferencias_estoque_comercial ===');
  if (d3.length === 0) console.log('  (tabela nao existe)');
  d3.forEach(r => console.log(`  ${r.column_name} | ${r.data_type} | ${r.is_nullable}`));

  // tabelas com transfer/remessa
  const d4 = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='alissonerp' AND (table_name ILIKE '%transfer%' OR table_name ILIKE '%remessa%')`;
  console.log('=== tabelas transfer/remessa ===');
  d4.forEach(r => console.log(`  ${r.table_name}`));
} finally { await sql.end(); }
