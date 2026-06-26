import pg from 'postgres';
const sql = pg('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

// D1a: tabelas de movimentação
const d1a = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'alissonerp'
    AND (table_name LIKE '%moviment%' OR table_name LIKE '%controle%' OR table_name LIKE '%estoque%')
  ORDER BY table_name`;
console.log('D1a tabelas:', d1a.map(r => r.table_name));

// D1b: colunas de movimentacoes_estoque
const d1b = await sql`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'movimentacoes_estoque'
  ORDER BY ordinal_position`;
console.log('D1b colunas movimentacoes_estoque:');
d1b.forEach(r => console.log(' ', r.column_name, '|', r.data_type, '| nullable:', r.is_nullable, '| default:', r.column_default));

// D1c: colunas de controle_estoque (caso existir)
const d1c = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'controle_estoque'
  ORDER BY ordinal_position`;
if (d1c.length > 0) { console.log('D1c colunas controle_estoque:'); d1c.forEach(r => console.log(' ', r.column_name, '|', r.data_type, '| nullable:', r.is_nullable)); }

// D1d: colunas de vw_saldo_estoque (conferir colunas disponíveis)
const d1d = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'vw_saldo_estoque'
  ORDER BY ordinal_position`;
console.log('D1d colunas vw_saldo_estoque:', d1d.map(r => r.column_name));

await sql.end();
