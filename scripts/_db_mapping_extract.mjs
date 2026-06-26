/**
 * _db_mapping_extract.mjs
 * Extração TOTAL do catálogo do banco para docs/db-mapping/_raw/
 * Saída: vários arquivos JSON crus que servem de fonte de verdade.
 * Uso: node scripts/_db_mapping_extract.mjs
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "db-mapping", "_raw");
fs.mkdirSync(OUT, { recursive: true });

const CONN =
  "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres";

const TARGET_SCHEMAS = [
  "alissonerp",
  "public",
  "directus",
  "crm",
  "auth",
  "storage",
  "extensions",
];

function save(name, data) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  console.log(`  -> ${path.relative(ROOT, p)}  (${Array.isArray(data) ? data.length : Object.keys(data).length} entries)`);
}

async function main() {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  console.log("Conectado.\n");

  // 1) Schemas (todos)
  const schemas = (
    await c.query(`
    SELECT n.nspname AS schema_name,
           pg_catalog.obj_description(n.oid, 'pg_namespace') AS description
    FROM pg_namespace n
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
    ORDER BY n.nspname
  `)
  ).rows;
  save("01_schemas.json", schemas);

  // 2) Tabelas + comments
  const tables = (
    await c.query(
      `
    SELECT t.table_schema, t.table_name, t.table_type,
           pg_catalog.obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass::oid, 'pg_class') AS description,
           (SELECT reltuples::bigint FROM pg_class
              WHERE oid = format('%I.%I', t.table_schema, t.table_name)::regclass) AS approx_rows
    FROM information_schema.tables t
    WHERE t.table_schema = ANY($1) AND t.table_type IN ('BASE TABLE','FOREIGN TABLE')
    ORDER BY t.table_schema, t.table_name
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("02_tables.json", tables);

  // 3) Colunas + comments
  const columns = (
    await c.query(
      `
    SELECT c.table_schema, c.table_name, c.column_name, c.ordinal_position,
           c.data_type, c.udt_name, c.character_maximum_length,
           c.numeric_precision, c.numeric_scale,
           c.is_nullable, c.column_default,
           pg_catalog.col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) AS description
    FROM information_schema.columns c
    WHERE c.table_schema = ANY($1)
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("03_columns.json", columns);

  // 4) Constraints (PK, FK, UNIQUE, CHECK)
  const pks = (
    await c.query(
      `
    SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
           array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      USING (constraint_schema, constraint_name, table_schema, table_name)
    WHERE tc.table_schema = ANY($1)
      AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
    GROUP BY tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("04_pk_unique.json", pks);

  const fks = (
    await c.query(
      `
    SELECT tc.table_schema AS src_schema,
           tc.table_name   AS src_table,
           tc.constraint_name,
           kcu.column_name AS src_column,
           ccu.table_schema AS ref_schema,
           ccu.table_name   AS ref_table,
           ccu.column_name  AS ref_column,
           rc.update_rule, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      USING (constraint_schema, constraint_name, table_schema, table_name)
    JOIN information_schema.constraint_column_usage ccu
      USING (constraint_name, table_schema)
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = ANY($1)
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("05_fks.json", fks);

  const checks = (
    await c.query(
      `
    SELECT n.nspname AS schema_name,
           cl.relname AS table_name,
           con.conname AS constraint_name,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE con.contype = 'c'
      AND n.nspname = ANY($1)
    ORDER BY n.nspname, cl.relname, con.conname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("06_check_constraints.json", checks);

  // 5) Índices completos
  const indexes = (
    await c.query(
      `
    SELECT schemaname, tablename, indexname, indexdef,
           pg_relation_size(format('%I.%I', schemaname, indexname)::regclass) AS size_bytes
    FROM pg_indexes
    WHERE schemaname = ANY($1)
    ORDER BY schemaname, tablename, indexname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("07_indexes.json", indexes);

  // 6) Funções e procedures (com corpo!)
  const functions = (
    await c.query(
      `
    SELECT n.nspname AS schema_name,
           p.proname  AS function_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_catalog.pg_get_function_result(p.oid) AS return_type,
           CASE p.prokind WHEN 'f' THEN 'FUNCTION' WHEN 'p' THEN 'PROCEDURE'
                          WHEN 'a' THEN 'AGGREGATE' WHEN 'w' THEN 'WINDOW' END AS kind,
           l.lanname AS language,
           p.prosecdef AS security_definer,
           p.provolatile AS volatility,
           pg_catalog.obj_description(p.oid, 'pg_proc') AS description,
           pg_catalog.pg_get_functiondef(p.oid) AS source_full
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language  l ON l.oid = p.prolang
    WHERE n.nspname = ANY($1)
    ORDER BY n.nspname, p.proname, arguments
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("08_functions.json", functions);

  // 7) Triggers (com função alvo)
  const triggers = (
    await c.query(
      `
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           t.tgname  AS trigger_name,
           pg_get_triggerdef(t.oid, true) AS definition,
           CASE t.tgtype::int & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
           CASE t.tgtype::int & 64 WHEN 64 THEN 'INSTEAD OF' ELSE NULL END AS instead_of,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN (t.tgtype::int & 4)  = 4  THEN 'INSERT' END,
             CASE WHEN (t.tgtype::int & 8)  = 8  THEN 'DELETE' END,
             CASE WHEN (t.tgtype::int & 16) = 16 THEN 'UPDATE' END,
             CASE WHEN (t.tgtype::int & 32) = 32 THEN 'TRUNCATE' END
           ], NULL) AS events,
           t.tgenabled,
           pn.nspname || '.' || p.proname AS function_full_name
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc  p     ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname, t.tgname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("09_triggers.json", triggers);

  // 8) Views + matviews (definições COMPLETAS)
  const views = (
    await c.query(
      `
    SELECT schemaname AS schema_name, viewname AS view_name, viewowner AS owner,
           definition, FALSE AS is_materialized
    FROM pg_views
    WHERE schemaname = ANY($1)
    UNION ALL
    SELECT schemaname, matviewname, matviewowner, definition, TRUE
    FROM pg_matviews
    WHERE schemaname = ANY($1)
    ORDER BY 1, 2
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("10_views.json", views);

  // 9) RLS Policies
  const policies = (
    await c.query(
      `
    SELECT schemaname, tablename, policyname,
           permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = ANY($1)
    ORDER BY schemaname, tablename, policyname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("11_rls_policies.json", policies);

  // RLS habilitada por tabela
  const rlsEnabled = (
    await c.query(
      `
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("12_rls_enabled.json", rlsEnabled);

  // 10) Sequences
  const sequences = (
    await c.query(
      `
    SELECT sequence_schema, sequence_name, data_type, start_value, minimum_value,
           maximum_value, increment, cycle_option
    FROM information_schema.sequences
    WHERE sequence_schema = ANY($1)
    ORDER BY sequence_schema, sequence_name
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("13_sequences.json", sequences);

  // 11) Tipos enum / domain customizados
  const enums = (
    await c.query(
      `
    SELECT n.nspname AS schema_name, t.typname AS type_name,
           array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ANY($1)
    GROUP BY n.nspname, t.typname
    ORDER BY n.nspname, t.typname
  `,
      [TARGET_SCHEMAS]
    )
  ).rows;
  save("14_enums.json", enums);

  // 12) Extensões instaladas
  const extensions = (
    await c.query(
      `
    SELECT e.extname, e.extversion, n.nspname AS schema_name
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    ORDER BY e.extname
  `
    )
  ).rows;
  save("15_extensions.json", extensions);

  // 13) Resumo: contagens por schema
  const summary = {};
  for (const s of TARGET_SCHEMAS) {
    summary[s] = {
      tables: tables.filter((t) => t.table_schema === s && t.table_type === "BASE TABLE").length,
      columns: columns.filter((c) => c.table_schema === s).length,
      views: views.filter((v) => v.schema_name === s && !v.is_materialized).length,
      matviews: views.filter((v) => v.schema_name === s && v.is_materialized).length,
      functions: functions.filter((f) => f.schema_name === s && f.kind === "FUNCTION").length,
      procedures: functions.filter((f) => f.schema_name === s && f.kind === "PROCEDURE").length,
      triggers: triggers.filter((t) => t.schema_name === s).length,
      rls_policies: policies.filter((p) => p.schemaname === s).length,
      indexes: indexes.filter((i) => i.schemaname === s).length,
      sequences: sequences.filter((sq) => sq.sequence_schema === s).length,
      enums: enums.filter((e) => e.schema_name === s).length,
      check_constraints: checks.filter((cc) => cc.schema_name === s).length,
      foreign_keys: fks.filter((fk) => fk.src_schema === s).length,
    };
  }
  save("00_summary.json", summary);

  await c.end();
  console.log("\n=== Concluído ===");
  console.log("Resumo por schema:");
  console.table(summary);
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
