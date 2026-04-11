import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== Schema public.produtos + public.itens_venda ===\n');

console.log('── public.produtos — colunas NOT NULL ──');
const notnull = await sql`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'produtos'
    AND is_nullable = 'NO'
  ORDER BY ordinal_position
`;
notnull.forEach(c => {
  console.log(`  ${c.column_name.padEnd(30)} ${c.data_type.padEnd(20)} default=${c.column_default ?? 'NULL'}`);
});

console.log('\n── PK + UNIQUE constraints ──');
const constraints = await sql`
  SELECT con.conname, con.contype,
         pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  WHERE ns.nspname = 'public' AND cl.relname = 'produtos'
    AND con.contype IN ('p', 'u')
`;
constraints.forEach(c => console.log(`  ${c.conname} (${c.contype}): ${c.def}`));

console.log('\n── Exemplo real (produto de teste existente id=1501019) ──');
const [exemplo] = await sql`
  SELECT * FROM public.produtos WHERE id_produto = 1501019
`;
if (exemplo) {
  Object.entries(exemplo).forEach(([k, v]) => {
    if (v !== null && v !== '' && v !== 0) {
      const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 60);
      console.log(`  ${k.padEnd(30)} = ${val}`);
    }
  });
}

console.log('\n── MAX id_produto atual ──');
const [{ max_id }] = await sql`SELECT MAX(id_produto) AS max_id FROM public.produtos`;
console.log(`  ${max_id}`);

console.log('\n── SKU TESTE-MP-R1 já existe? ──');
const [existe] = await sql`SELECT id_produto FROM public.produtos WHERE sku = 'TESTE-MP-R1'`;
console.log(`  ${existe ? `Sim (id=${existe.id_produto})` : 'Não existe, pode criar'}`);

await sql.end();
