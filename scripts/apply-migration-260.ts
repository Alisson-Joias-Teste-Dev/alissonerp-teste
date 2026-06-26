/**
 * Aplica migration 260 no banco (transacional). Aborta tudo se qualquer
 * statement falhar.
 */
import postgres from "postgres";
import { readFileSync } from "fs";

try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^["']|["']$/g, "");
  }
} catch { /* ignora */ }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

async function apply() {
  console.log("Conectado em:", url.replace(/\/\/[^@]*@/, "//<creds>@"));
  const migration = readFileSync("supabase/migrations/260_orcamento_integridade.sql", "utf-8");
  console.log("Aplicando migration 260 dentro de uma transacao...");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx.unsafe(migration);
    });
    console.log("OK — migration aplicada com sucesso.");
  } catch (e) {
    console.error("FALHOU — transacao revertida:", e);
    process.exit(1);
  }
  await sql.end();
}

apply().catch(e => { console.error(e); process.exit(1); });
