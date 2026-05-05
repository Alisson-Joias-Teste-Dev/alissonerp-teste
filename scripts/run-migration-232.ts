/**
 * Script para rodar migration 232: corrigir comissões zeradas.
 *
 * Uso: npx tsx scripts/run-migration-232.ts
 *
 * Usa a DATABASE_URL do .env.local para conectar diretamente
 * ao banco de produção (evita dependência do Supabase CLI local).
 */

import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

// ═══ Carregar DATABASE_URL do .env.local ════════════════════════════════════

const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("ERRO: .env.local não encontrado.");
  process.exit(1);
}

const envContent = readFileSync(envPath, "utf-8");
// Remove BOM se presente
const cleanContent = envContent.replace(/^\uFEFF/, "");

const envVars: Record<string, string> = {};
for (const line of cleanContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
  envVars[key] = val;
}

const DATABASE_URL = envVars.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não encontrada no .env.local.");
  process.exit(1);
}

console.log(`Conectando ao banco... (${DATABASE_URL.split("@")[1]?.split("/")[0] || "???"})`);

// ═══ Conectar ════════════════════════════════════════════════════════════════

const sql = postgres(DATABASE_URL, {
  ssl: false,
  max: 1,
  idle_timeout: 10,
  connection: { search_path: "alissonerp,public" },
});

// ═══ Executar migration ══════════════════════════════════════════════════════

async function main() {
  try {
    const migrationPath = resolve(
      process.cwd(),
      "supabase",
      "migrations",
      "232_fix_comissao_zerada.sql",
    );

    if (!existsSync(migrationPath)) {
      console.error("ERRO: Arquivo de migration não encontrado:", migrationPath);
      process.exit(1);
    }

    const sqlContent = readFileSync(migrationPath, "utf-8");
    console.log("Migration carregada, executando...\n");

    // Separar statements por linhas com "-- N." ou blocos significativos
    // e executar um por um para vermos o output de cada passo

    const blocks = sqlContent
      .split("\n\n")
      .filter((b) => b.trim() && !b.trim().startsWith("-- ="));

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const commentLine = lines.find((l) => l.trim().startsWith("--"));
      const label = commentLine
        ? commentLine.replace(/^--\s*/, "").trim()
        : "Executando bloco...";

      // Junta só as linhas SQL (ignora comentários)
      const stmt = lines
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .trim();

      if (!stmt) continue;

      console.log(`\n>>> ${label}`);
      try {
        const result = await sql.unsafe(stmt);
        if (result.length > 0) {
          if (result.length === 1) {
            const row = result[0] as Record<string, unknown>;
            for (const [k, v] of Object.entries(row)) {
              console.log(`    ${k}: ${v}`);
            }
          } else {
            console.log(`    ${result.length} linha(s)`);
            for (const row of result.slice(0, 5) as Record<string, unknown>[]) {
              console.log("   ", row);
            }
            if (result.length > 5) console.log(`    ... +${result.length - 5} linhas`);
          }
        } else {
          console.log("    OK (sem linhas retornadas)");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`    ERRO: ${msg}`);
      }
    }

    console.log("\n✅ Migration concluída.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
