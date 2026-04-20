import postgres from "postgres";
import { readFileSync } from "fs";

const sql = postgres(process.env.DATABASE_URL, { ssl: false });

const migration = readFileSync("supabase/migrations/154_quebra_percentual_sobre_pmc.sql", "utf-8");

try {
  await sql.unsafe(migration);
  console.log("Migration 091 aplicada com sucesso!");

  // Verificar resultado
  const rows = await sql`SELECT * FROM alissonerp.vw_quebra_por_ourives LIMIT 3`;
  console.log("vw_quebra_por_ourives (amostra):", rows);

  const mensal = await sql`SELECT * FROM alissonerp.vw_quebra_mensal LIMIT 3`;
  console.log("vw_quebra_mensal (amostra):", mensal);
} catch (err) {
  console.error("Erro ao aplicar migration:", err.message);
} finally {
  await sql.end();
}
