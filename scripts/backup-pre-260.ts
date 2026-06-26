/**
 * Backup snapshot do estado pre-migration 260 (read-only).
 * Salva em backups/pre-260-{timestamp}.json.
 * Nao substitui pg_dump completo, mas captura o necessario pra reverter
 * mudancas estruturais desta migration (constraints/indices/sequences).
 */
import postgres from "postgres";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

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

async function backup() {
  const snapshot: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    host: url.replace(/\/\/[^@]*@/, "//<creds>@"),
  };

  snapshot.constraints_orcamentos = await sql`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
    ORDER BY conname
  `;

  snapshot.indices_orcamentos = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'alissonerp' AND tablename = 'orcamentos'
    ORDER BY indexname
  `;

  snapshot.columns_orcamentos = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'orcamentos'
    ORDER BY ordinal_position
  `;

  snapshot.columns_orcamento_fichas = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'orcamento_fichas_tecnicas'
    ORDER BY ordinal_position
  `;

  snapshot.sequences = await sql`
    SELECT sequencename, last_value, start_value, increment_by, min_value, max_value
    FROM pg_sequences
    WHERE schemaname = 'alissonerp'
      AND sequencename IN ('orcamento_seq', 'venda_numero_seq')
  `;

  snapshot.grants_seq = await sql`
    SELECT object_schema, object_name, grantee, privilege_type
    FROM information_schema.usage_privileges
    WHERE object_schema = 'alissonerp'
      AND object_name IN ('orcamento_seq','venda_numero_seq')
  `;

  // Conta linhas pra detectar se algo foi perdido depois
  const [{ count }] = await sql`SELECT COUNT(*) AS count FROM alissonerp.orcamentos`;
  snapshot.row_count_orcamentos = Number(count);
  const [{ count: count2 }] = await sql`SELECT COUNT(*) AS count FROM alissonerp.orcamento_fichas_tecnicas`;
  snapshot.row_count_fichas = Number(count2);

  mkdirSync("backups", { recursive: true });
  const fname = `backups/pre-260-${Date.now()}.json`;
  writeFileSync(fname, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`Backup salvo em: ${fname}`);
  console.log(`Linhas orcamentos: ${snapshot.row_count_orcamentos}`);
  console.log(`Linhas fichas:     ${snapshot.row_count_fichas}`);
  console.log(`Constraints:       ${(snapshot.constraints_orcamentos as unknown[]).length}`);
  console.log(`Indices:           ${(snapshot.indices_orcamentos as unknown[]).length}`);

  await sql.end();
}

backup().catch(e => { console.error(e); process.exit(1); });
