/**
 * Aplica migration 242 (conversao_estoque) diretamente via postgres.js
 * Uso: node scripts/apply_242.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, "..", "_apply_242_log.txt");
const envPath = join(DIR, "..", ".env.local");
const envRaw = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const DB_URL = env.DATABASE_URL;
if (!DB_URL) { 
  writeFileSync(LOG, "ERRO: Sem DATABASE_URL\n");
  process.exit(1); 
}

const sql = postgres(DB_URL, { max: 2, idle_timeout: 10, connect_timeout: 10 });
const lines = [];

function log(msg) {
  console.log(msg);
  lines.push(msg);
}

async function main() {
  log("Aplicando migration 242 — Conversao de Estoque...\n");

  const migrationPath = join(DIR, "..", "supabase", "migrations", "242_conversao_estoque.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  log(`Lido SQL: ${migrationSql.length} bytes\n`);

  await sql.unsafe(migrationSql);
  log("OK: Migration 242 aplicada com sucesso!\n");

  // Verificacoes
  const tabelas = ["conversoes_estoque", "conversao_itens"];
  for (const tbl of tabelas) {
    const [t] = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = ${tbl}
    `;
    if (t) log(`OK: Tabela alissonerp.${tbl} existe`);
    else log(`ERRO: Tabela alissonerp.${tbl} NAO foi criada`);
  }

  const [enumVal] = await sql`
    SELECT enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'enum_tipo_ordem' AND e.enumlabel = 'conversao'
  `;
  if (enumVal) log('OK: Enum conversao existe em enum_tipo_ordem');
  else log('INFO: Enum conversao ja existia (IF NOT EXISTS)');

  const [param] = await sql`
    SELECT chave FROM alissonerp.parametros_sistema WHERE chave = 'INSUMO_CONVERSAO_PADRAO'
  `;
  if (param) log('OK: Parametro INSUMO_CONVERSAO_PADRAO configurado');
  else log('WARN: Parametro INSUMO_CONVERSAO_PADRAO nao encontrado');

  await sql.end();
  log("\nMigration 242 concluida.");

  writeFileSync(LOG, lines.join("\n"), "utf-8");
}

main().catch(e => {
  const errMsg = `ERRO ao aplicar migration: ${e.message || e}\n${e.stack || ""}`;
  console.error(errMsg);
  writeFileSync(LOG, errMsg, "utf-8");
  process.exit(1);
});
