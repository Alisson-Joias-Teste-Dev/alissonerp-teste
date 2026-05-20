// Backfill: preenche alissonerp.ordens.numero_pedido com numero_venda
// das vendas_erp ligadas via venda_id. Só afeta ordens com numero_pedido NULL.
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== BACKFILL numero_pedido em alissonerp.ordens ===\n');

async function main() {
  // 1. Contar quantas ordens serão afetadas
  const [{ affect_count }] = await sql`
    SELECT COUNT(*)::int AS affect_count
    FROM alissonerp.ordens o
    JOIN alissonerp.vendas_erp v ON v.id = o.venda_id
    WHERE o.numero_pedido IS NULL
      AND v.numero_venda IS NOT NULL
  `;
  console.log(`Ordens que serão atualizadas: ${affect_count}`);

  if (affect_count === 0) {
    console.log('Nada pra fazer. Saindo.');
    return;
  }

  // 2. Preview: mostrar as 10 primeiras
  console.log('\nPreview (10 primeiras):');
  const preview = await sql`
    SELECT o.id, o.numero_ordem, v.numero_venda
    FROM alissonerp.ordens o
    JOIN alissonerp.vendas_erp v ON v.id = o.venda_id
    WHERE o.numero_pedido IS NULL
      AND v.numero_venda IS NOT NULL
    ORDER BY o.id DESC
    LIMIT 10
  `;
  preview.forEach(p => console.log(`  ${p.numero_ordem} (id ${p.id}) <- venda ${p.numero_venda}`));

  // 3. Executar UPDATE
  console.log('\nExecutando UPDATE...');
  const result = await sql`
    UPDATE alissonerp.ordens o
       SET numero_pedido = v.numero_venda
      FROM alissonerp.vendas_erp v
     WHERE o.venda_id = v.id
       AND o.numero_pedido IS NULL
       AND v.numero_venda IS NOT NULL
  `;
  console.log(`✅ ${result.count} linha(s) atualizada(s)`);

  // 4. Validar: quantas ainda estão NULL com venda_id?
  const [{ restante }] = await sql`
    SELECT COUNT(*)::int AS restante
    FROM alissonerp.ordens
    WHERE numero_pedido IS NULL
      AND venda_id IS NOT NULL
  `;
  console.log(`\nOrdens ainda com numero_pedido NULL mas com venda_id: ${restante}`);

  // 5. Amostra das ordens atualizadas
  console.log('\nAmostra pós-backfill (últimas 10 com numero_pedido preenchido):');
  const amostra = await sql`
    SELECT id, numero_ordem, numero_pedido, venda_id
    FROM alissonerp.ordens
    WHERE numero_pedido IS NOT NULL
    ORDER BY id DESC
    LIMIT 10
  `;
  amostra.forEach(a => console.log(`  ${a.numero_ordem} | pedido: ${a.numero_pedido} | venda_id: ${a.venda_id}`));

  console.log('\n=== BACKFILL CONCLUIDO ✅ ===');
}

try {
  await main();
} catch (err) {
  console.error('❌ ERRO:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  await sql.end();
}
