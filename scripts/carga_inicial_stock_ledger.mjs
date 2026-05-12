// Carga Inicial do Stock Ledger Entry
// Snapshot do saldo atual e importa como "opening stock"
// Executar com o sistema parado (fora do horario comercial)
// Uso: node scripts/carga_inicial_stock_ledger.mjs [--warehouse 2]

import postgres from 'postgres';
import { fileURLToPath } from 'node:url';

const DB = process.env.DATABASE_URL ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB, { ssl: false, max: 1 });

const WAREHOUSE_ID = parseInt(process.argv.find(a => a.startsWith('--warehouse='))?.split('=')[1] ?? '2', 10);

async function cargaInicial() {
  console.log(`\n🔒 CARGA INICIAL STOCK LEDGER ENTRY — Warehouse ${WAREHOUSE_ID}\n`);

  try {
    // 1. Contar registros atuais no SLE
    const [{ total: existing }] = await sql`
      SELECT COUNT(*)::int AS total FROM alissonerp.stock_ledger_entry
      WHERE warehouse_id = ${WAREHOUSE_ID}
    `;
    if (existing > 0) {
      console.log(`⚠️  Já existem ${existing} registros no stock_ledger_entry para este warehouse.`);
      console.log('   Para recarregar, limpe com:');
      console.log(`   DELETE FROM alissonerp.stock_ledger_entry WHERE warehouse_id = ${WAREHOUSE_ID};`);
      console.log('   (apenas se o DELETE trigger estiver desativado temporariamente)\n');
    }

    // 2. Snapshot do saldo atual do movimentacoes_estoque_comercial
    console.log(`📦 Consultando saldo do movimentacoes_estoque_comercial (warehouse_id=${WAREHOUSE_ID})...`);
    const saldos = await sql`
      SELECT
        m.produto_id,
        COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::numeric AS saldo
      FROM alissonerp.movimentacoes_estoque_comercial m
      WHERE m.status = 'efetivado'
        AND m.local_estoque_id = ${WAREHOUSE_ID}
      GROUP BY m.produto_id
      HAVING COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END), 0) != 0
      ORDER BY m.produto_id
    `;
    console.log(`   ${saldos.length} produtos com saldo != 0\n`);

    if (saldos.length === 0) {
      console.log('⚠️  Nenhum saldo encontrado. Nada a importar.');
      return;
    }

    // 3. Mostrar preview
    console.log('Preview (primeiros 10):');
    console.log('  Produto ID | Saldo');
    console.log('  -----------|------');
    for (const s of saldos.slice(0, 10)) {
      console.log(`  ${String(s.produto_id).padStart(10)} | ${s.saldo}`);
    }
    if (saldos.length > 10) {
      console.log(`  ... e mais ${saldos.length - 10} produtos`);
    }

    // 4. Perguntar confirmacao
    console.log(`\n⚠️  Serão inseridos ${saldos.length} registros no stock_ledger_entry.`);
    console.log('   Pressione Ctrl+C para cancelar ou aguarde 5s para continuar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. Inserir em lote
    const batchId = Date.now();
    const batchDate = new Date().toISOString().split('T')[0];
    const batchTime = '00:00:01';
    const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';

    console.log(`\n💾 Inserindo lote (batch_id=${batchId})...`);

    let inseridos = 0;
    const BATCH_SIZE = 100;
    for (let i = 0; i < saldos.length; i += BATCH_SIZE) {
      const batch = saldos.slice(i, i + BATCH_SIZE);
      const values = batch.map(s => ({
        item_id: Number(s.produto_id),
        item_type: 'produto',
        warehouse_id: WAREHOUSE_ID,
        actual_qty: s.saldo,
        batch_id: batchId,
        voucher_type: 'ajuste_entrada',
        posting_date: batchDate,
        posting_time: batchTime,
        created_by: SYSTEM_USER,
      }));

      const r = await sql`INSERT INTO alissonerp.stock_ledger_entry ${sql(values)}`;
      if (r.length !== batch.length) console.warn(`  inseriu ${r.length} em vez de ${batch.length}`);
      inseridos += batch.length;
      console.log(`   ${inseridos}/${saldos.length} inseridos`);
    }

    console.log(`\n✅ ${inseridos} registros importados com sucesso!`);

    // 6. Verificacao
    const [{ totalSle }] = await sql`
      SELECT COUNT(*)::int AS total_sle
      FROM alissonerp.stock_ledger_entry
      WHERE batch_id = ${batchId}
    `;
    console.log(`   Registros no SLE com batch_id=${batchId}: ${totalSle}`);

    // 7. Comparar divergencias
    console.log('\n🔍 Verificando divergencias entre sistema antigo e novo...');
    const divergencias = await sql`
      WITH saldo_antigo AS (
        SELECT m.produto_id,
               COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::numeric AS saldo
        FROM alissonerp.movimentacoes_estoque_comercial m
        WHERE m.status = 'efetivado' AND m.local_estoque_id = ${WAREHOUSE_ID}
        GROUP BY m.produto_id
      ),
      saldo_novo AS (
        SELECT sle.item_id AS produto_id,
               COALESCE(SUM(sle.actual_qty), 0)::numeric AS saldo
        FROM alissonerp.stock_ledger_entry sle
        WHERE sle.item_type = 'produto'
          AND sle.warehouse_id = ${WAREHOUSE_ID}
          AND sle.is_cancelled = false
          AND sle.batch_id = ${batchId}
        GROUP BY sle.item_id
      )
      SELECT
        COALESCE(a.produto_id, n.produto_id) AS produto_id,
        COALESCE(a.saldo, 0) AS saldo_antigo,
        COALESCE(n.saldo, 0) AS saldo_novo,
        (COALESCE(n.saldo, 0) - COALESCE(a.saldo, 0))::numeric AS divergencia
      FROM saldo_antigo a
      FULL OUTER JOIN saldo_novo n ON a.produto_id = n.produto_id
      WHERE COALESCE(n.saldo, 0) != COALESCE(a.saldo, 0)
      ORDER BY abs(COALESCE(n.saldo, 0) - COALESCE(a.saldo, 0)) DESC
    `;

    if (divergencias.length > 0) {
      console.log(`⚠️  ${divergencias.length} DIVERGENCIAS ENCONTRADAS:`);
      for (const d of divergencias.slice(0, 10)) {
        console.log(`  Produto ${d.produto_id}: Antigo=${d.saldo_antigo}, Novo=${d.saldo_novo}, Div=${d.divergencia}`);
      }
      if (divergencias.length > 10) {
        console.log(`  ... e mais ${divergencias.length - 10}`);
      }
      console.log('\n❌ CARGA COM DIVERGENCIAS. Revise antes de usar em producao.');
    } else {
      console.log('✅ NENHUMA DIVERGENCIA — Carga 100% consistente!');
    }

    // 8. Proximo passo: verificar saldo da Loja
    const [{ lojaTotal }] = await sql`
      SELECT COALESCE(SUM(actual_qty), 0)::numeric AS loja_total
      FROM alissonerp.stock_ledger_entry
      WHERE warehouse_id = ${WAREHOUSE_ID} AND is_cancelled = false AND batch_id = ${batchId}
    `;
    console.log(`\n📊 Saldo total na Loja (warehouse ${WAREHOUSE_ID}): ${lojaTotal} unidades\n`);

    console.log('🎉 Carga inicial concluida!');
    console.log('   Agora o PDV ja pode consultar o stock_ledger_entry.');
    console.log('   Motoboy transfers: POST /api/estoque-comercial/transferir-motoboy');

  } catch (err) {
    console.error('\n❌ ERRO:', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

cargaInicial();
