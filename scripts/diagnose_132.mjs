// Diagnóstico: verifica tipo real do stone_prices no banco
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Verifica tipo da coluna no schema
  const colInfo = await sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'config_orcamento'
      AND column_name IN ('stone_prices', 'calibracao', 'pricing_categories', 'groove_rules')
  `;
  console.log('=== Tipo das colunas ===');
  colInfo.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} / ${c.udt_name}`));

  // 2. Pega o stone_prices com jsonb_typeof e array_length
  const [row] = await sql`
    SELECT
      stone_prices,
      jsonb_typeof(stone_prices) AS jb_type,
      jsonb_array_length(stone_prices) AS arr_len
    FROM alissonerp.config_orcamento
    WHERE name = 'default'
  `;
  console.log('\n=== Estado atual ===');
  console.log('  jsonb_typeof:', row.jb_type);
  console.log('  array_length:', row.arr_len);
  console.log('  retorno JS tipo:', typeof row.stone_prices);
  console.log('  é array JS?:', Array.isArray(row.stone_prices));

  // 3. Extrai elemento por elemento via SQL pra garantir
  const elements = await sql`
    SELECT jsonb_array_elements(stone_prices) AS elem
    FROM alissonerp.config_orcamento
    WHERE name = 'default'
  `;
  console.log('\n=== Elementos extraídos ===');
  elements.forEach((e, i) => {
    console.log(`  [${i}]`, typeof e.elem, JSON.stringify(e.elem));
  });

  // 4. Teste: ler como texto bruto
  const [rowText] = await sql`
    SELECT stone_prices::text AS raw FROM alissonerp.config_orcamento WHERE name = 'default'
  `;
  console.log('\n=== Texto bruto ===');
  console.log('  raw:', rowText.raw.substring(0, 300));
} finally {
  await sql.end();
}
