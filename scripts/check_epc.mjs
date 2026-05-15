import sql from '../src/lib/db';

async function main() {
  try {
    console.log('Colunas de produtos com "api" ou "id_externo":');
    const rows = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'produtos'
        AND (column_name ILIKE '%api%' OR column_name ILIKE '%id_externo%' OR column_name ILIKE '%integracao%')
      ORDER BY column_name
    `;
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error('Erro:', e instanceof Error ? e.message : e);
  }
  process.exit(0);
}
main();
