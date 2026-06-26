import pg from 'postgres';
const sql = pg('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// marcador enum
const marcador = await sql`
  SELECT t.typname, e.enumlabel
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname ILIKE '%marcador%'`;
console.log('marcador enum:', marcador.map(r => r.typname+':'+r.enumlabel));

// D2
const d2 = await sql`
  SELECT count(*)::int as c FROM alissonerp.movimentacoes_estoque
  WHERE insumo_id IN (SELECT id FROM alissonerp.insumos WHERE categoria_id = 2)`;
console.log('D2 mov pedras:', d2[0].c);

// D2b
const d2b = await sql`
  SELECT m.id, i.nome, m.deposito_id, m.entrada, m.saida, m.marcador::text, m.obs
  FROM alissonerp.movimentacoes_estoque m
  JOIN alissonerp.insumos i ON i.id = m.insumo_id
  WHERE i.categoria_id = 2 LIMIT 5`;
console.log('D2b sample:'); d2b.forEach(r => console.log(' ', r.id, r.nome, 'dep='+r.deposito_id, 'ent='+r.entrada, 'sai='+r.saida, 'marc='+r.marcador, 'obs='+r.obs));

// D3
const d3 = await sql`
  SELECT count(*)::int as c FROM alissonerp.movimentacoes_estoque
  WHERE insumo_id IN (SELECT id FROM alissonerp.insumos WHERE categoria_id = 1)`;
console.log('D3 mov metal (NÃO TOCAR):', d3[0].c);

// D4
const d4 = await sql`
  SELECT id, nome, sku, saldo FROM alissonerp.insumos
  WHERE categoria_id = 2 AND ativo = true AND saldo > 0
  ORDER BY nome LIMIT 30`;
console.log('D4 pedras com saldo legado:', d4.length);
d4.forEach(r => console.log(' ', r.id, r.nome, '|', r.sku, '| saldo='+r.saldo));

// D5
const d5 = await sql`
  SELECT count(*)::int as qtd, SUM(saldo) as total
  FROM alissonerp.insumos
  WHERE categoria_id = 2 AND ativo = true AND saldo > 0`;
console.log('D5:', d5[0].qtd, 'pedras, saldo total:', d5[0].total);

await sql.end();
