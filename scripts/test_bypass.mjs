import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

await sql`SELECT set_config('app.sync_ativo', 'true', true)`;
const [r] = await sql`SELECT current_setting('app.sync_ativo', true) as val`;
console.log('sync_ativo =', r?.val ?? 'NULL (not set)');

// Test delete one duplicate
try {
  const result = await sql`
    DELETE FROM alissonerp.itens_venda_erp
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY venda_id, produto_id, COALESCE(sku, '')
          ORDER BY id) as rn
        FROM alissonerp.itens_venda_erp
        WHERE produto_id IS NOT NULL
      ) ranked WHERE rn > 1
      LIMIT 1
    )
    RETURNING id
  `;
  console.log('Delete test: removed', result.length, 'row(s), ids:', result.map(r=>r.id));
} catch(e) {
  console.error('Delete failed:', e.message);
}

await sql`SELECT set_config('app.sync_ativo', '', true)`;
await sql.end();
