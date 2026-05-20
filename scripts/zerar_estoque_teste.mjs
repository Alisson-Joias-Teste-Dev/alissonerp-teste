import postgres from "postgres";

const sql = postgres("postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres", {
  ssl: false,
});

async function main() {
  const PRODUTO_ID = 39188;

  try {
    // 1. Mostrar situação atual
    const saldo = await sql`
      SELECT * FROM alissonerp.vw_saldo_estoque_comercial_v2 WHERE produto_id = ${PRODUTO_ID}
    `;
    console.log("Saldo atual:", JSON.stringify(saldo, null, 2));

    if (saldo.length === 0 || Number(saldo[0].saldo_fisico) === 0) {
      console.log("ℹ️  Estoque já está zerado. Nada a fazer.");
      await sql.end();
      return;
    }

    const qtd = Number(saldo[0].saldo_fisico);
    const localId = Number(saldo[0].local_estoque_id);

    console.log(`\n→ Criando saída de ${qtd} unidades do local ${localId}...`);

    // INSERT com UUID válido do auth.users
    await sql`
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, local_estoque_id, tipo, quantidade, motivo, status, observacao, created_by, referencia_id, referencia_tipo)
      VALUES
        (${PRODUTO_ID}, ${localId}, 'saida', ${qtd}, 'ajuste_saida', 'efetivado',
         'Zerando estoque de produto de teste - ID 39188',
         '681f363c-9e67-48a9-bd5f-443edc8eb79e'::uuid,
         ${PRODUTO_ID}, 'ajuste_manual')
    `;

    console.log("✅ Movimentação de saída criada com sucesso!");

    // 2. Verificar resultado final
    const saldoFinal = await sql`
      SELECT * FROM alissonerp.vw_saldo_estoque_comercial_v2 WHERE produto_id = ${PRODUTO_ID}
    `;
    console.log("\n=== Saldo após operação ===");
    console.log(JSON.stringify(saldoFinal, null, 2));

    await sql.end();
  } catch (err) {
    console.error("Erro:", err);
    process.exit(1);
  }
}

main();
