/**
 * Aplica migration 241 (produto_personalizacao_campos) diretamente via postgres.js
 * Uso: node scripts/apply-migration-241.mjs
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const DIR = dirname(fileURLToPath(import.meta.url));
const envPath = join(DIR, "..", ".env.local");
const envRaw = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const DB_URL = env.DATABASE_URL;
if (!DB_URL) { console.error("Sem DATABASE_URL"); process.exit(1); }

const sql = postgres(DB_URL, { max: 2, idle_timeout: 10, connect_timeout: 10 });

async function main() {
  console.log("Aplicando migration 241...");

  const migrationPath = join(DIR, "..", "supabase", "migrations", "241_produto_personalizacao_campos.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  // Executa o SQL completo
  await sql.unsafe(migrationSql);
  console.log("Migration 241 aplicada com sucesso!");

  // Verifica se a tabela foi criada
  const [t] = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'alissonerp' AND table_name = 'produto_personalizacao_campos'
  `;
  if (t) {
    console.log("Tabela produto_personalizacao_campos existe OK");
  } else {
    console.error("ERRO: Tabela produto_personalizacao_campos NAO foi criada!");
    process.exit(1);
  }

  await sql.end();
  console.log("Concluido.");
}

main().catch(e => {
  console.error("Erro ao aplicar migration:", e);
  process.exit(1);
});
