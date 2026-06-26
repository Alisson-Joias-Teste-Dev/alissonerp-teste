import postgres from 'postgres';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== APLICANDO VERSÃO GOLDEN DA TRIGGER ===\n');

  await sql`
    CREATE OR REPLACE FUNCTION alissonerp.fn_mirror_movimento_to_sle()
    RETURNS TRIGGER AS $$
    DECLARE
      v_sle_id BIGINT;
    BEGIN
      INSERT INTO alissonerp.stock_ledger_entry (
        item_id, item_type, warehouse_id,
        actual_qty,
        voucher_type, voucher_id,
        obs, created_by, posting_date, posting_time
      ) VALUES (
        NEW.produto_id, 'produto', NEW.local_estoque_id,
        CASE WHEN NEW.tipo = 'entrada' THEN NEW.quantidade ELSE -NEW.quantidade END,
        CASE
          WHEN NEW.motivo = 'venda' THEN 'venda'
          WHEN NEW.motivo IN ('transferencia_saida','transferencia_entrada') THEN 'transferencia'
          WHEN NEW.motivo = 'devolucao' THEN 'devolucao'
          WHEN NEW.motivo = 'inventario' THEN 'inventario'
          WHEN NEW.motivo = 'estorno' THEN 'reconciliacao'
          WHEN NEW.motivo = 'ajuste_entrada' THEN 'ajuste_entrada'
          WHEN NEW.motivo = 'ajuste_saida' THEN 'ajuste_saida'
          WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
          WHEN NEW.motivo IN ('reservado_conversao','virou_peso') THEN 'ordem_producao'
          WHEN NEW.motivo = 'recusado_conversao' THEN 'reconciliacao'
          WHEN NEW.motivo IN ('conversao_sku_ida','conversao_sku_volta') THEN 'transferencia'
          WHEN NEW.motivo IN ('conversao_sku_consumo','conversao_sku_producao') THEN 'ordem_producao'
          ELSE 'manual'
        END,
        COALESCE(NEW.referencia_id, NEW.id),
        NEW.observacao,
        COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
        NEW.created_at::DATE,
        NEW.created_at::TIME
      ) RETURNING id INTO v_sle_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `;
  console.log('✓ Trigger function atualizada para versão golden');

  // verify the function exists
  const [fn] = await sql`
    SELECT proname, prosrc
    FROM pg_proc
    WHERE proname = 'fn_mirror_movimento_to_sle'
      AND pronamespace = 'alissonerp'::regnamespace
  `;
  const lines = fn.prosrc.split('\n');
  const caseLines = lines.filter(l => l.includes("WHEN NEW.motivo"));
  console.log('\n=== MAPEAMENTOS NA TRIGGER ===');
  caseLines.forEach(l => console.log(`  ${l.trim()}`));
  console.log(`  Total: ${caseLines.length} mapeamentos`);

  await sql.end();
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
