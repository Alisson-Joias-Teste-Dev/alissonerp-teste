import postgres from "postgres";
import { readFileSync } from "fs";

const sql = postgres(process.env.DATABASE_URL, { ssl: false });

const migration = readFileSync("supabase/migrations/155_quebra_drilldown_views.sql", "utf-8");

try {
  await sql.unsafe(migration);
  console.log("Migration 092 aplicada com sucesso!");

  const rows = await sql`SELECT * FROM alissonerp.vw_quebra_por_setor`;
  console.log("vw_quebra_por_setor:", rows);

  const ops = await sql`SELECT * FROM alissonerp.vw_quebra_setor_operador LIMIT 5`;
  console.log("vw_quebra_setor_operador (amostra):", ops);
} catch (err) {
  console.error("Erro:", err.message);
} finally {
  await sql.end();
}
