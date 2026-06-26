/**
 * _db_mapping_code_xref.mjs
 * Faz grep determinístico de cada objeto do banco contra src/ e scripts/.
 * Saída: docs/db-mapping/_raw/code_references.json
 *
 * Estratégia:
 * - Carrega lista de tabelas, views, funções dos JSONs crus
 * - Lê todos os arquivos .ts/.tsx/.js/.mjs/.sql sob src/, scripts/, supabase/migrations/
 * - Para cada objeto, faz match por regex do nome (com word boundaries)
 * - Escreve JSON com referências + contagens + lista de "sem uso"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "docs", "db-mapping", "_raw");

const SRC_DIRS = [
  path.join(ROOT, "src"),
  path.join(ROOT, "scripts"),
  path.join(ROOT, "supabase", "migrations"),
];
const EXCLUDE = ["node_modules", ".next", "backups", ".git", "_raw"];
const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".sql"]);

// ── 1) Listar arquivos ───────────────────────────────────────────────────
function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else if (EXTS.has(path.extname(e.name).toLowerCase())) files.push(p);
  }
  return files;
}

const files = SRC_DIRS.flatMap((d) => walk(d));
console.log(`Arquivos a varrer: ${files.length}`);

// Carrega arquivos para memória (todos juntos não passam de 50MB)
const fileContents = new Map();
let totalBytes = 0;
for (const f of files) {
  const content = fs.readFileSync(f, "utf8");
  fileContents.set(f, content.split("\n"));
  totalBytes += content.length;
}
console.log(`Bytes totais lidos: ${(totalBytes / 1e6).toFixed(1)} MB`);

// ── 2) Carregar inventário banco ────────────────────────────────────────
const tables = JSON.parse(fs.readFileSync(path.join(RAW, "02_tables.json"), "utf8"));
const views = JSON.parse(fs.readFileSync(path.join(RAW, "10_views.json"), "utf8"));
const functions = JSON.parse(fs.readFileSync(path.join(RAW, "08_functions.json"), "utf8"));
const triggers = JSON.parse(fs.readFileSync(path.join(RAW, "09_triggers.json"), "utf8"));

const objects = [
  ...tables.map((t) => ({ schema: t.table_schema, name: t.table_name, type: "table" })),
  ...views.map((v) => ({ schema: v.schema_name, name: v.view_name, type: "view" })),
  ...functions
    // exclui funções de extensions/auth/storage internas (são MUITAS e ruidosas)
    .filter((f) => ["alissonerp", "public", "directus", "crm"].includes(f.schema_name))
    .map((f) => ({ schema: f.schema_name, name: f.function_name, type: "function" })),
  ...triggers
    .filter((t) => ["alissonerp", "public", "directus", "crm"].includes(t.schema_name))
    .map((t) => ({ schema: t.schema_name, name: t.trigger_name, type: "trigger" })),
];

// dedupe (algumas funções com sobrecarga geram duplicatas)
const seen = new Set();
const objectsUniq = [];
for (const o of objects) {
  const key = `${o.type}|${o.schema}|${o.name}`;
  if (seen.has(key)) continue;
  seen.add(key);
  objectsUniq.push(o);
}
console.log(`Objetos a buscar: ${objectsUniq.length}`);

// ── 3) Buscar cada objeto ────────────────────────────────────────────────
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const byObject = {};
const byObjectCounts = {};
const supabaseFromCalls = [];

const supabaseFromRe = /supabase\s*\.\s*from\s*\(\s*['"`]([^'"`]+)['"`]/g;

// Pré-processa cada arquivo: pega linhas em uma só passada para supabase.from
for (const [file, lines] of fileContents) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("supabase")) continue;
    let m;
    supabaseFromRe.lastIndex = 0;
    while ((m = supabaseFromRe.exec(line)) !== null) {
      supabaseFromCalls.push({ file: rel, line: i + 1, table: m[1] });
    }
  }
}

// Para cada objeto, fazer grep por nome
const start = Date.now();
let processed = 0;
for (const obj of objectsUniq) {
  const key = `${obj.schema}.${obj.name}`;
  // Regex: nome com word boundaries
  // Para evitar falsos positivos em nomes muito comuns, exigimos:
  // - ou word boundary (\b)
  // - ou prefixo schema (alissonerp.xxx, public.xxx)
  // - ou prefixo dot ('.xxx)
  const re = new RegExp(`(?<![\\w.])${escRe(obj.name)}(?![\\w])`, "g");
  const hits = [];
  let total = 0;

  for (const [file, lines] of fileContents) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!re.test(line)) continue;
      re.lastIndex = 0;
      total++;
      if (hits.length < 30) {
        hits.push({
          file: path.relative(ROOT, file).replace(/\\/g, "/"),
          line: i + 1,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }

  if (total > 0) {
    byObject[key] = hits;
    byObjectCounts[key] = total;
  }

  processed++;
  if (processed % 100 === 0) {
    console.log(`  ${processed}/${objectsUniq.length} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
  }
}

// ── 4) Lista "sem uso" ───────────────────────────────────────────────────
const unused = [];
for (const o of objectsUniq) {
  const key = `${o.schema}.${o.name}`;
  if (!byObjectCounts[key]) unused.push({ ...o, key });
}

// Top 20 mais referenciados
const topReferenced = Object.entries(byObjectCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([key, count]) => ({ object: key, count }));

// ── 5) Migrations summary ────────────────────────────────────────────────
const migrationDir = path.join(ROOT, "supabase", "migrations");
const migrations = [];
if (fs.existsSync(migrationDir)) {
  const list = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of list) {
    const content = fs.readFileSync(path.join(migrationDir, f), "utf8");
    // procura primeira linha de comment ou primeiro DDL
    let summary = "";
    const lines = content.split("\n").slice(0, 30);
    for (const l of lines) {
      const t = l.trim();
      if (t.startsWith("--") && t.length > 4) {
        summary = t.replace(/^--+\s*/, "");
        break;
      }
    }
    if (!summary) {
      const ddlMatch = content.match(/CREATE\s+(?:OR\s+REPLACE\s+)?(\w+)\s+(?:IF\s+NOT\s+EXISTS\s+)?(["\w.]+)/i)
        || content.match(/ALTER\s+(\w+)\s+(?:IF\s+EXISTS\s+)?(["\w.]+)/i);
      if (ddlMatch) summary = `${ddlMatch[1].toUpperCase()} ${ddlMatch[2]}`;
    }
    migrations.push({ file: f, summary: summary.slice(0, 200) });
  }
}

// ── 6) Salvar ────────────────────────────────────────────────────────────
const out = {
  generated_at: new Date().toISOString().slice(0, 10),
  files_scanned: files.length,
  total_bytes: totalBytes,
  objects_searched: objectsUniq.length,
  objects_with_match: Object.keys(byObject).length,
  objects_without_match: unused.length,
  by_object: byObject,
  by_object_counts: byObjectCounts,
  top_referenced: topReferenced,
  unused_objects: unused.map((o) => o.key).sort(),
  unused_by_schema: unused.reduce((acc, o) => {
    acc[o.schema] = (acc[o.schema] || 0) + 1;
    return acc;
  }, {}),
  unused_by_type: unused.reduce((acc, o) => {
    acc[o.type] = (acc[o.type] || 0) + 1;
    return acc;
  }, {}),
  supabase_from_calls: supabaseFromCalls,
  supabase_from_count_by_table: supabaseFromCalls.reduce((acc, c) => {
    acc[c.table] = (acc[c.table] || 0) + 1;
    return acc;
  }, {}),
  migrations,
};

fs.writeFileSync(path.join(RAW, "code_references.json"), JSON.stringify(out, null, 2), "utf8");
console.log(`\nArquivos varridos: ${files.length}`);
console.log(`Objetos buscados: ${objectsUniq.length}`);
console.log(`Com match: ${Object.keys(byObject).length}`);
console.log(`Sem uso identificado: ${unused.length}`);
console.log(`supabase.from calls: ${supabaseFromCalls.length}`);
console.log(`Migrations: ${migrations.length}`);
console.log(`\nTop 10 mais referenciados:`);
for (const t of topReferenced.slice(0, 10)) console.log(`  ${t.object} (${t.count})`);
