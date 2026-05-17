import postgres from "postgres";

const sql = postgres("postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres", {
  ssl: false,
});

async function main() {
  try {
    // 1. Dados do produto
    const [prod] = await sql`
      SELECT id_produto, sku, nome
      FROM public.produtos
      WHERE id_produto = 39188
    `;
    console.log("=== DADOS DO PRODUTO ===");
    console.log(prod);

    // 2. Saldo no estoque comercial (v2)
    const saldo = await sql`
      SELECT local_estoque_id, saldo_fisico, reservado, disponivel, em_transito
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = 39188
    `;
    console.log("\n=== SALDO (vw_saldo_estoque_comercial_v2) ===");
    console.log(JSON.stringify(saldo, null, 2));

    // 3. View simples
    const saldoSimples = await sql`
      SELECT *
      FROM alissonerp.vw_saldo_estoque_comercial
      WHERE produto_id = 39188
    `;
    console.log("\n=== SALDO (vw_saldo_estoque_comercial) ===");
    console.log(JSON.stringify(saldoSimples, null, 2));

    // 4. Nomes dos locais de estoque
    if (saldo.length > 0) {
      const localIds = saldo.map((r) => r.local_estoque_id);
      const locais = await sql`
        SELECT id, nome
        FROM alissonerp.locais_estoque
        WHERE id = ANY(${localIds}::int[])
      `;
      console.log("\n=== LOCAIS DE ESTOQUE ===");
      console.log(JSON.stringify(locais, null, 2));
    }

    await sql.end();
  } catch (err) {
    console.error("Erro:", err);
    process.exit(1);
  }
}

main();
