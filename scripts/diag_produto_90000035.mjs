import postgres from "postgres";

const sql = postgres("postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres", {
  ssl: false,
  max: 1,
});

const PRODUTO = 90000035;

async function main() {
  console.log("=".repeat(70));
  console.log("  DIAGNÓSTICO DE ESTOQUE — Produto " + PRODUTO);
  console.log("=".repeat(70));

  // 1. Dados do produto
  const [prod] = await sql`SELECT id_produto, sku, nome FROM public.produtos WHERE id_produto = ${PRODUTO}`;
  if (!prod) {
    console.log("\n❌ PRODUTO NÃO ENCONTRADO em public.produtos");
    // Try searching by sku
    const prods = await sql`SELECT id_produto, sku, nome FROM public.produtos WHERE sku ILIKE '%' || ${String(PRODUTO)} || '%' OR id_produto::text ILIKE '%' || ${String(PRODUTO)} || '%' LIMIT 10`;
    if (prods.length > 0) {
      console.log("   Produtos similares encontrados:");
      for (const p of prods) console.log(`   - id_produto=${p.id_produto}  sku=${p.sku}  nome=${p.nome}`);
    }
    await sql.end();
    process.exit(1);
  }
  console.log(`\n📦 PRODUTO ENCONTRADO:`);
  console.log(`   id_produto: ${prod.id_produto}`);
  console.log(`   sku:        ${prod.sku}`);
  console.log(`   nome:       ${prod.nome}`);

  // 2. Config de estoque
  const [cfg] = await sql`SELECT * FROM alissonerp.estoque_comercial_config WHERE produto_id = ${PRODUTO}`;
  console.log(`\n⚙️  CONFIG DE ESTOQUE:`);
  if (!cfg) {
    console.log("   ❌ NÃO EXISTE — produto não ativado para controle de estoque!");
    console.log("   → A view vw_saldo_estoque_comercial_v2 usa INNER JOIN com esta tabela");
    console.log("   → Sem essa config, o produto NUNCA aparece nas views de saldo");
  } else {
    console.log(`   ativo:         ${cfg.ativo}`);
    console.log(`   estoque_minimo: ${cfg.estoque_minimo}`);
    console.log(`   created_at:    ${cfg.created_at}`);
    if (!cfg.ativo) console.log("   ⚠️  Config existe mas está INATIVO!");
  }

  // 3. Movimentações no estoque comercial
  const movs = await sql`
    SELECT id, tipo, quantidade, status, local_estoque_id, motivo, observacao, created_at
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE produto_id = ${PRODUTO}
    ORDER BY created_at DESC
  `;
  console.log(`\n📋 MOVIMENTAÇÕES (${movs.length} registros):`);
  if (movs.length === 0) {
    console.log("   Nenhuma movimentação encontrada.");
  } else {
    for (const m of movs) {
      const problemas = [];
      if (m.status !== "efetivado") problemas.push(`status='${m.status}'`);
      if (!m.local_estoque_id) problemas.push("local_estoque_id=NULL");
      const warn = problemas.length > 0 ? ` ⚠️  ${problemas.join(", ")}` : " ✅ OK";
      console.log(`   [${m.created_at}] ${m.tipo} qtd=${m.quantidade} local=${m.local_estoque_id ?? "NULL"} status=${m.status} motivo=${m.motivo}${warn}`);
    }
  }

  // 4. Cálculo manual do saldo
  const [saldoCalc] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'entrada' AND status = 'efetivado' THEN quantidade ELSE 0 END), 0) AS total_entradas,
      COALESCE(SUM(CASE WHEN tipo = 'saida' AND status = 'efetivado' THEN quantidade ELSE 0 END), 0) AS total_saidas,
      COALESCE(SUM(CASE WHEN tipo = 'entrada' AND status = 'efetivado' THEN quantidade ELSE -quantidade END), 0) AS saldo
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE produto_id = ${PRODUTO}
  `;
  console.log(`\n🧮 SALDO CALCULADO (apenas movimentos efetivados):`);
  console.log(`   Entradas: ${saldoCalc.total_entradas}`);
  console.log(`   Saídas:   ${saldoCalc.total_saidas}`);
  console.log(`   Saldo:    ${saldoCalc.saldo}`);

  const [saldoTotal] = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE -quantidade END), 0) AS saldo
    FROM alissonerp.movimentacoes_estoque_comercial
    WHERE produto_id = ${PRODUTO}
  `;
  console.log(`   Saldo (todos, ignorando status): ${saldoTotal.saldo}`);

  // 5. View de saldo
  try {
    const vwMov = await sql`SELECT * FROM alissonerp.vw_saldo_estoque_comercial WHERE produto_id = ${PRODUTO} LIMIT 5`;
    console.log(`\n👁️  VIEW vw_saldo_estoque_comercial:`);
    if (vwMov.length === 0) console.log("   (vazio)");
    else console.log(`   ${JSON.stringify(vwMov[0], null, 2)}`);
  } catch (e) {
    console.log(`   Erro ao consultar view: ${e.message}`);
  }

  try {
    const vwMovV2 = await sql`SELECT * FROM alissonerp.vw_saldo_estoque_comercial_v2 WHERE produto_id = ${PRODUTO} LIMIT 5`;
    console.log(`\n👁️  VIEW vw_saldo_estoque_comercial_v2:`);
    if (vwMovV2.length === 0) console.log("   (vazio)");
    else console.log(`   ${JSON.stringify(vwMovV2[0], null, 2)}`);
  } catch (e) {
    console.log(`   Erro ao consultar view v2: ${e.message}`);
  }

  // 6. Stock ledger
  const sle = await sql`
    SELECT id, quantity, qty_after, direction, reason, created_at
    FROM alissonerp.stock_ledger_entry
    WHERE produto_id = ${PRODUTO}
    ORDER BY created_at DESC
  `;
  console.log(`\n📒 STOCK LEDGER (${sle.length} registros):`);
  if (sle.length === 0) {
    console.log("   Nenhum registro no stock ledger.");
    console.log("   → Se havia movimento, o trigger trg_mirror_movimento_to_sle não disparou");
    console.log("     (só dispara quando status='efetivado' no INSERT)");
  } else {
    for (const s of sle) {
      console.log(`   [${s.created_at}] qty=${s.quantity} after=${s.qty_after} dir=${s.direction} reason=${s.reason}`);
    }
  }

  // 7. Locais de estoque disponíveis
  const locais = await sql`SELECT id, nome FROM alissonerp.locais_estoque ORDER BY id`;
  console.log(`\n🏭 LOCAIS DE ESTOQUE:`);
  for (const l of locais) console.log(`   ${l.id}: ${l.nome}`);

  console.log("\n" + "=".repeat(70));
  console.log("  FIM DO DIAGNÓSTICO");
  console.log("=".repeat(70));

  await sql.end();
}

main().catch(err => {
  console.error("Erro:", err);
  process.exit(1);
});
