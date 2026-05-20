// Agente A — Pre-check: directus.itens_ordem_1
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== PRE-CHECK: directus.itens_ordem_1 ===\n');

try {
  // Passo 3 — Colunas
  console.log('── PASSO 3: Colunas de directus.itens_ordem_1 ──');
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'directus' AND table_name = 'itens_ordem_1'
    ORDER BY ordinal_position
  `;
  if (cols.length === 0) {
    console.log('  ⚠️  Tabela itens_ordem_1 NÃO EXISTE ou sem colunas!');
    // Buscar tabelas com nome similar
    const similares = await sql`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_name ILIKE '%itens%' OR table_name ILIKE '%item%'
      ORDER BY table_schema, table_name
    `;
    console.log('  Tabelas com "itens/item":', JSON.stringify(similares));
  } else {
    for (const c of cols) {
      console.log(`  ${c.column_name.padEnd(35)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`);
    }
  }

  // Passo 4 — 5 rows de exemplo
  console.log('\n── PASSO 4: 5 rows de exemplo ──');
  const sample = await sql`SELECT * FROM directus.itens_ordem_1 LIMIT 5`;
  for (const r of sample) {
    console.log('  ', JSON.stringify(r));
  }

  // Passo 5 — Colunas com "ordem"
  console.log('\n── PASSO 5: Colunas com "ordem" ──');
  const ordemCols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'directus' AND table_name = 'itens_ordem_1'
      AND column_name ILIKE '%ordem%'
  `;
  console.log('  Colunas *ordem*:', JSON.stringify(ordemCols));

  // Passo 6 — Colunas com produto/sku/item
  console.log('\n── PASSO 6: Colunas produto/sku/item ──');
  const prodCols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'directus' AND table_name = 'itens_ordem_1'
      AND (column_name ILIKE '%produto%' OR column_name ILIKE '%sku%' OR column_name ILIKE '%item%')
  `;
  console.log('  Colunas *produto/sku/item*:', JSON.stringify(prodCols));

  // Passo 7 — Contagem por ordem (usando a coluna de FK descoberta)
  if (ordemCols.length > 0) {
    const fkCol = ordemCols[0].column_name;
    console.log(`\n── PASSO 7: Contagem por ordem (FK: ${fkCol}) ──`);
    const countByOrdem = await sql.unsafe(`
      SELECT ${fkCol}, COUNT(*)::int AS total
      FROM directus.itens_ordem_1
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 10
    `);
    for (const r of countByOrdem) {
      console.log(`  ${fkCol}=${r[fkCol]} → ${r.total} itens`);
    }
  }

  // Passo 8 — Total
  console.log('\n── PASSO 8: Total de itens ──');
  const total = await sql`SELECT COUNT(*)::int AS total FROM directus.itens_ordem_1`;
  console.log(`  Total: ${total[0].total}`);

  // Passo 9 — Bridge alissonerp.ordens.directus_ordem_id
  console.log('\n── PASSO 9: Bridge alissonerp → directus ──');
  const bridge = await sql`
    SELECT id, numero_ordem, directus_ordem_id
    FROM alissonerp.ordens LIMIT 5
  `;
  console.log('  Amostra bridge:', JSON.stringify(bridge));

  // Extra — verificar se FK bate com directus.ordens.id
  if (ordemCols.length > 0) {
    const fkCol = ordemCols[0].column_name;
    console.log('\n── EXTRA: Verificar join com alissonerp.ordens ──');
    const joinTest = await sql.unsafe(`
      SELECT o.id, o.numero_ordem, o.directus_ordem_id, COUNT(i.id)::int AS qtd_itens
      FROM alissonerp.ordens o
      LEFT JOIN directus.itens_ordem_1 i ON i.${fkCol} = o.directus_ordem_id
      WHERE i.id IS NOT NULL
      GROUP BY o.id, o.numero_ordem, o.directus_ordem_id
      ORDER BY qtd_itens DESC
      LIMIT 5
    `);
    for (const r of joinTest) {
      console.log(`  alissonerp.id=${r.id} ${r.numero_ordem} → ${r.qtd_itens} itens`);
    }

    // Média de itens
    const media = await sql.unsafe(`
      SELECT ROUND(AVG(cnt)::numeric, 2) AS media
      FROM (
        SELECT ${fkCol}, COUNT(*)::int AS cnt
        FROM directus.itens_ordem_1 GROUP BY 1
      ) sub
    `);
    console.log(`  Média de itens por ordem: ${media[0].media}`);
  }

  // Extra — verificar se existe referência a public.produtos
  console.log('\n── EXTRA: Todas as colunas (para identificar FK produto) ──');
  const allCols = await sql`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_schema = 'directus' AND table_name = 'itens_ordem_1'
    ORDER BY ordinal_position
  `;
  console.log('  Todas:', allCols.map(c => c.column_name).join(', '));

} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await sql.end();
}
