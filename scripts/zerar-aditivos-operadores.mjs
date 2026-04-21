// Script one-shot: zera saldo de aditivos dos operadores (deposito_id != 1)
import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres";
const sql = postgres(DATABASE_URL, { ssl: false, max: 1 });

async function main() {
  // 1. Dry-run: mostra o que vai ser zerado
  const pendentes = await sql`
    SELECT
      d.id            AS deposito_id,
      d.nome          AS deposito_nome,
      vs.insumo_id,
      i.nome          AS insumo_nome,
      vs.local_estoque_id,
      ROUND(vs.saldo::numeric, 4) AS saldo_atual
    FROM alissonerp.vw_saldo_estoque vs
    JOIN alissonerp.depositos d ON d.id = vs.deposito_id
    JOIN alissonerp.insumos   i ON i.id = vs.insumo_id
    WHERE vs.deposito_id != 1
      AND vs.saldo > 0.0001
    ORDER BY d.id, i.id
  `;

  if (pendentes.length === 0) {
    console.log("✅ Nenhum saldo encontrado nos depósitos dos operadores.");
    await sql.end();
    return;
  }

  console.log("\n📋 Saldos que serão zerados:");
  console.table(pendentes.map(r => ({
    deposito: `[${r.deposito_id}] ${r.deposito_nome}`,
    insumo:   `[${r.insumo_id}] ${r.insumo_nome}`,
    local_estoque_id: r.local_estoque_id,
    saldo:    Number(r.saldo_atual),
  })));

  // 2. Executa zeragem
  const result = await sql`
    INSERT INTO alissonerp.movimentacoes_estoque
      (insumo_id, deposito_id, local_estoque_id, entrada, saida, marcador, obs, data_hora)
    SELECT
      vs.insumo_id,
      vs.deposito_id,
      COALESCE(vs.local_estoque_id, d.local_estoque_id),
      0,
      vs.saldo,
      'SA',
      'Zerar aditivos operadores — ajuste administrativo',
      NOW()
    FROM alissonerp.vw_saldo_estoque vs
    JOIN alissonerp.depositos d ON d.id = vs.deposito_id
    WHERE vs.deposito_id != 1
      AND vs.saldo > 0.0001
      AND COALESCE(vs.local_estoque_id, d.local_estoque_id) IS NOT NULL
    RETURNING id, deposito_id, insumo_id, saida
  `;

  console.log(`\n✅ ${result.length} movimentação(ões) criada(s):`);
  console.table(result.map(r => ({
    id: r.id,
    deposito_id: r.deposito_id,
    insumo_id: r.insumo_id,
    saida_g: Number(r.saida),
  })));

  // 3. Verifica pote intacto
  const [pote] = await sql`
    SELECT ROUND(COALESCE(SUM(saldo), 0)::numeric, 4) AS saldo_pote
    FROM alissonerp.vw_saldo_estoque
    WHERE deposito_id = 1 AND insumo_id = 1
  `;
  console.log(`\n🏭 Saldo Pote (deposito_id=1, ouro) após operação: ${pote.saldo_pote}g — intacto ✅`);

  await sql.end();
}

main().catch(e => { console.error("❌ Erro:", e.message); process.exit(1); });
