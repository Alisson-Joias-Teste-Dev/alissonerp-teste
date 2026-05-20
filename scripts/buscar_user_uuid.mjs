import postgres from "postgres";

const sql = postgres("postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres", {
  ssl: false,
});

async function main() {
  try {
    const users = await sql`SELECT id, email FROM auth.users LIMIT 5`;
    console.log("auth.users:", JSON.stringify(users, null, 2));

    const usuarios = await sql`SELECT id, nome FROM alissonerp.usuarios LIMIT 5`;
    console.log("\nalissonerp.usuarios:", JSON.stringify(usuarios, null, 2));

    // Check fk constraint target
    const fk = await sql`
      SELECT
        tc.constraint_name,
        ccu.table_schema AS foreign_schema,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_name = 'movimentacoes_estoque_comercial_created_by_fkey'
    `;
    console.log("\nFK info:", JSON.stringify(fk, null, 2));

    await sql.end();
  } catch (err) {
    console.error("Erro:", err);
    process.exit(1);
  }
}

main();
