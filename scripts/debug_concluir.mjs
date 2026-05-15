import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const cks = await sql`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'alissonerp.movimentacoes_estoque_comercial'::regclass`;
  console.log('CONSTRAINTS movimentacoes_estoque_comercial:');
  cks.forEach(c => console.log(' -', c.conname, ':', c.def));

  const cols = await sql`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='movimentacoes_estoque_comercial' ORDER BY ordinal_position`;
  console.log('\nCOLUMNS:');
  cols.forEach(c => console.log(' -', c.column_name, c.data_type, c.is_nullable, c.column_default));

  // Produto existe?
  const p = await sql`SELECT id_produto FROM public.produtos WHERE id_produto = 1501019 LIMIT 1`;
  console.log('\nProduto 1501019:', p);

  // cliente_id da venda
  const v = await sql`SELECT id, cliente_id FROM alissonerp.vendas_erp WHERE id = 28771`;
  console.log('Venda 28771:', v);

  if (v[0]?.cliente_id) {
    const c = await sql`SELECT id_contato, nome FROM public.contatos WHERE id_contato = ${v[0].cliente_id} LIMIT 1`;
    console.log('Contato:', c);
  }

  // vale_troca constraints
  const vtCks = await sql`SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'alissonerp.vale_troca'::regclass`;
  console.log('\nCONSTRAINTS vale_troca:');
  vtCks.forEach(c => console.log(' -', c.conname, ':', c.def));
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await sql.end();
}
