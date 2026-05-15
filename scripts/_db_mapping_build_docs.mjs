/**
 * _db_mapping_build_docs.mjs
 * Gera os arquivos markdown finais a partir dos JSONs crus em docs/db-mapping/_raw/.
 * Output em docs/db-mapping/<schema>/*.md + 00-overview.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "docs", "db-mapping", "_raw");
const OUT = path.join(ROOT, "docs", "db-mapping");

const SCHEMAS = ["alissonerp", "public", "directus", "crm", "auth", "storage", "extensions"];

const NOW = new Date().toISOString().slice(0, 10);

function parsePgArray(s) {
  // Postgres array literal "{a,b,c}" -> ["a","b","c"]
  if (s == null) return [];
  if (Array.isArray(s)) return s;
  if (typeof s !== "string") return [];
  const t = s.trim();
  if (!t.startsWith("{") || !t.endsWith("}")) return [];
  const inner = t.slice(1, -1);
  if (!inner) return [];
  // simples (sem strings com vírgulas dentro de quotes)
  return inner.split(",").map((x) => x.replace(/^"(.*)"$/, "$1"));
}

const ARRAY_FIELDS_BY_FILE = {
  "04_pk_unique.json": ["columns"],
  "09_triggers.json": ["events"],
  "11_rls_policies.json": ["roles"],
  "14_enums.json": ["values"],
};

const J = (n) => {
  const data = JSON.parse(fs.readFileSync(path.join(RAW, n), "utf8"));
  const fields = ARRAY_FIELDS_BY_FILE[n];
  if (fields && Array.isArray(data)) {
    for (const row of data) {
      for (const f of fields) {
        if (typeof row[f] === "string") row[f] = parsePgArray(row[f]);
      }
    }
  }
  return data;
};

const summary = J("00_summary.json");
const schemas = J("01_schemas.json");
const tables = J("02_tables.json");
const columns = J("03_columns.json");
const pks = J("04_pk_unique.json");
const fks = J("05_fks.json");
const checks = J("06_check_constraints.json");
const indexes = J("07_indexes.json");
const functions = J("08_functions.json");
const triggers = J("09_triggers.json");
const views = J("10_views.json");
const policies = J("11_rls_policies.json");
const rlsEnabled = J("12_rls_enabled.json");
const sequences = J("13_sequences.json");
const enums = J("14_enums.json");
const extensions = J("15_extensions.json");

let codeRefs = null;
try {
  codeRefs = J("code_references.json");
} catch {
  /* ainda não disponível */
}

// ── helpers ──────────────────────────────────────────────────────────────
function write(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  console.log("  ->", path.relative(ROOT, p), `(${content.length} bytes)`);
}

function esc(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function fmtType(c) {
  if (c.character_maximum_length) return `${c.data_type}(${c.character_maximum_length})`;
  if (c.numeric_precision && c.data_type === "numeric")
    return `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`;
  return c.udt_name && !["int4","int8","int2","numeric","text","bool","timestamptz","timestamp","uuid","date","jsonb","json","bytea","varchar","char"].includes(c.udt_name)
    ? c.udt_name
    : c.data_type;
}

function trimDef(s, n = 200) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}

function codeRefBlock(objects) {
  if (!codeRefs) return "";
  const refs = [];
  for (const obj of objects) {
    const total = codeRefs.by_object_counts?.[obj];
    const list = codeRefs.by_object?.[obj];
    if (total) refs.push({ obj, hits: list?.slice(0, 5) ?? [], total });
  }
  if (!refs.length) return "\n_Sem referência identificada no código._\n";
  let md = "\n**Uso no código:**\n";
  for (const r of refs) {
    md += `- \`${r.obj}\` — ${r.total} ocorrência(s)`;
    if (r.total > r.hits.length * 6) md += " _(amostra abaixo)_";
    md += "\n";
    for (const h of r.hits) md += `  - \`${h.file}:${h.line}\`\n`;
  }
  return md;
}

// ── 00 — overview ────────────────────────────────────────────────────────
{
  let md = `# Mapeamento Completo do Banco de Dados\n\n`;
  md += `> Gerado em: **${NOW}** | Fonte: queries diretas no PostgreSQL (\`pg_catalog\` + \`information_schema\`)\n`;
  md += `> Conexão: \`72.60.55.140:5543/postgres\` (Supabase self-hosted)\n\n`;
  md += `## Como navegar\n\n`;
  md += `- \`00-overview.md\` — este arquivo (visão geral, contagens, regras)\n`;
  md += `- \`<schema>/tables.md\` — tabelas, colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS\n`;
  md += `- \`<schema>/functions.md\` — funções/procedures com argumentos, retorno e CORPO COMPLETO\n`;
  md += `- \`<schema>/triggers.md\` — triggers com função alvo, evento e timing\n`;
  md += `- \`<schema>/views.md\` — views (e matviews) com SQL completo\n`;
  md += `- \`<schema>/rls.md\` — Row Level Security (políticas + habilitação por tabela)\n`;
  md += `- \`<schema>/sequences.md\` — sequences\n`;
  md += `- \`99-code-mapping.md\` — cross-reference banco → código\n`;
  md += `- \`99-summary.md\` — resumo executivo final\n\n`;

  md += `## Schemas detectados\n\n`;
  md += `| Schema | Descrição | Acesso (do projeto) |\n|--------|-----------|---------------------|\n`;
  const acessoMap = {
    alissonerp: "Leitura + Escrita — schema principal do ERP",
    public: "READONLY — Supabase legacy / contatos / vendedores / produtos",
    directus: "READONLY — schema legado Directus (pcp/ordens/protocolo)",
    crm: "schema CRM (não documentado no CLAUDE.md — investigar uso)",
    auth: "Gerenciado pelo Supabase GoTrue — só `supabase.auth.*`",
    storage: "Gerenciado pelo Supabase Storage — só `supabase.storage.*`",
    extensions: "Extensões Postgres (pgcrypto, pg_stat_statements, etc.)",
  };
  for (const s of schemas) {
    if (!SCHEMAS.includes(s.schema_name)) continue;
    md += `| \`${s.schema_name}\` | ${esc(s.description) || "—"} | ${acessoMap[s.schema_name] ?? "—"} |\n`;
  }
  md += `\n_Outros schemas detectados (não documentados aqui): ${schemas
    .filter((s) => !SCHEMAS.includes(s.schema_name))
    .map((s) => "`" + s.schema_name + "`").join(", ")}_\n\n`;

  md += `## Estatísticas globais (apenas schemas mapeados)\n\n`;
  md += `| Schema | Tabelas | Colunas | Views | Funções | Triggers | RLS Policies | Indexes | Sequences | Enums | CHECKs | FKs |\n`;
  md += `|--------|--------:|--------:|------:|--------:|---------:|-------------:|--------:|----------:|------:|-------:|----:|\n`;
  let tot = { tables: 0, columns: 0, views: 0, functions: 0, triggers: 0, rls_policies: 0, indexes: 0, sequences: 0, enums: 0, check_constraints: 0, foreign_keys: 0 };
  for (const s of SCHEMAS) {
    const x = summary[s];
    md += `| **${s}** | ${x.tables} | ${x.columns} | ${x.views + x.matviews} | ${x.functions} | ${x.triggers} | ${x.rls_policies} | ${x.indexes} | ${x.sequences} | ${x.enums} | ${x.check_constraints} | ${x.foreign_keys} |\n`;
    for (const k of Object.keys(tot)) tot[k] += x[k] ?? 0;
  }
  md += `| **TOTAL** | **${tot.tables}** | **${tot.columns}** | **${tot.views}** | **${tot.functions}** | **${tot.triggers}** | **${tot.rls_policies}** | **${tot.indexes}** | **${tot.sequences}** | **${tot.enums}** | **${tot.check_constraints}** | **${tot.foreign_keys}** |\n`;

  md += `\n## Extensões instaladas\n\n`;
  md += `| Extensão | Versão | Schema |\n|---|---|---|\n`;
  for (const e of extensions)
    md += `| \`${e.extname}\` | ${e.extversion} | \`${e.schema_name}\` |\n`;

  md += `\n## Convenções e regras inegociáveis\n\n`;
  md += `- **NUNCA** usar \`supabase.from(...)\` para tabelas no schema \`alissonerp\` — usar SQL direto via \`src/lib/db.ts\` (PostgREST tem bug que retorna \`[]\` silenciosamente).\n`;
  md += `- \`supabase.from(...)\` PODE ser usado para \`public.*\` (mas é READONLY).\n`;
  md += `- \`supabase.auth.*\` e \`supabase.storage.*\` funcionam normalmente.\n`;
  md += `- **Schemas READONLY:** \`public\` e \`directus\` — sem INSERT/UPDATE/DELETE.\n`;
  md += `- **PKs reais com nomes não-óbvios:** \`public.contatos.id_contato\`, \`public.produtos.id_produto\`.\n`;
  md += `- **Typo legado:** \`directus.ordens.peso_metal_negocido\` (sem "a").\n`;
  md += `- **Dupla-entrada de movimentação:** SEMPRE usar \`fn_criar_par_movimentacao\` — retorna \`(saida_id, entrada_id)\`.\n`;
  md += `- **Zonas no-touch (NUNCA alterar):** \`fn_processar_apontamento_pcp\` (mig 018), \`fn_processar_transferencia_saida\` (019), \`fn_processar_fechamento_dist\` (020), \`fn_concluir_protocolo\`, \`fn_processar_auditoria\`, \`fn_criar_servico_from_pcp\` (092), \`fn_calcular_peso_pedra_gramas\` (092).\n`;
  write("00-overview.md", md);
}

// ── tabelas por schema ───────────────────────────────────────────────────
function buildTablesMd(schema) {
  const ts = tables.filter((t) => t.table_schema === schema && t.table_type === "BASE TABLE");
  let md = `# \`${schema}\` — Tabelas\n\n`;
  md += `> ${ts.length} tabelas | gerado ${NOW}\n\n`;
  md += `## Índice\n\n`;
  for (const t of ts) {
    const desc = t.description ? ` — ${esc(t.description).slice(0, 120)}` : "";
    md += `- [\`${t.table_name}\`](#${t.table_name})${desc}\n`;
  }
  md += `\n---\n\n`;

  for (const t of ts) {
    md += `## ${t.table_name}\n\n`;
    if (t.description) md += `> ${esc(t.description)}\n\n`;
    md += `**Aprox. linhas:** ${t.approx_rows ?? "?"}\n\n`;

    const cols = columns.filter((c) => c.table_schema === schema && c.table_name === t.table_name);
    md += `### Colunas\n\n`;
    md += `| # | Coluna | Tipo | Null | Default | Comentário |\n|--:|--------|------|------|---------|-----------|\n`;
    for (const c of cols) {
      md += `| ${c.ordinal_position} | \`${c.column_name}\` | ${fmtType(c)} | ${c.is_nullable === "YES" ? "✓" : "—"} | ${c.column_default ? "`" + esc(trimDef(c.column_default, 80)) + "`" : "—"} | ${esc(c.description) || "—"} |\n`;
    }

    // PK / unique
    const localPks = pks.filter((p) => p.table_schema === schema && p.table_name === t.table_name);
    if (localPks.length) {
      md += `\n### Chaves\n\n`;
      for (const p of localPks)
        md += `- **${p.constraint_type}** \`${p.constraint_name}\` — (${p.columns.map((c) => "`" + c + "`").join(", ")})\n`;
    }

    // FKs (saída)
    const localFksOut = fks.filter((f) => f.src_schema === schema && f.src_table === t.table_name);
    if (localFksOut.length) {
      md += `\n### Foreign Keys (saída)\n\n`;
      for (const f of localFksOut)
        md += `- \`${f.src_column}\` → \`${f.ref_schema}.${f.ref_table}.${f.ref_column}\` (UPDATE ${f.update_rule}, DELETE ${f.delete_rule})\n`;
    }
    // FKs (entrada — quem aponta pra mim)
    const localFksIn = fks.filter((f) => f.ref_schema === schema && f.ref_table === t.table_name);
    if (localFksIn.length) {
      md += `\n### Referenciada por (entrada)\n\n`;
      for (const f of localFksIn)
        md += `- \`${f.src_schema}.${f.src_table}.${f.src_column}\` (constraint \`${f.constraint_name}\`)\n`;
    }

    // CHECK
    const localChecks = checks.filter((c) => c.schema_name === schema && c.table_name === t.table_name);
    if (localChecks.length) {
      md += `\n### CHECK constraints\n\n`;
      for (const ck of localChecks)
        md += `- \`${ck.constraint_name}\` — \`${esc(trimDef(ck.definition, 250))}\`\n`;
    }

    // Indexes (não-PK)
    const localIdx = indexes.filter(
      (i) => i.schemaname === schema && i.tablename === t.table_name && !i.indexname.endsWith("_pkey")
    );
    if (localIdx.length) {
      md += `\n### Índices\n\n`;
      for (const i of localIdx)
        md += `- \`${i.indexname}\` — \`${esc(trimDef(i.indexdef, 200))}\`\n`;
    }

    // Triggers nesta tabela
    const localTrigs = triggers.filter((tr) => tr.schema_name === schema && tr.table_name === t.table_name);
    if (localTrigs.length) {
      md += `\n### Triggers\n\n`;
      for (const tr of localTrigs)
        md += `- \`${tr.trigger_name}\` — ${tr.timing} ${tr.events.join("/")} → \`${tr.function_full_name}\` ${tr.tgenabled === "D" ? "(DISABLED)" : ""}\n`;
    }

    // RLS state
    const rls = rlsEnabled.find((r) => r.schema_name === schema && r.table_name === t.table_name);
    const localPolicies = policies.filter((p) => p.schemaname === schema && p.tablename === t.table_name);
    if (rls?.rls_enabled || localPolicies.length) {
      md += `\n### RLS\n\n`;
      md += `- **Enabled:** ${rls?.rls_enabled ? "✓" : "✗"} | **Forced:** ${rls?.force_rls ? "✓" : "✗"} | Políticas: ${localPolicies.length}\n`;
      for (const p of localPolicies) {
        md += `  - \`${p.policyname}\` (${p.cmd}, ${p.permissive}) roles=${(p.roles || []).join(",")}\n`;
        if (p.qual) md += `    USING: \`${esc(trimDef(p.qual, 200))}\`\n`;
        if (p.with_check) md += `    WITH CHECK: \`${esc(trimDef(p.with_check, 200))}\`\n`;
      }
    }

    // Code refs (se disponível)
    const candidates = [`${schema}.${t.table_name}`, t.table_name];
    md += codeRefBlock(candidates);

    md += `\n---\n\n`;
  }
  write(`${schema}/tables.md`, md);
}

// ── funções ──────────────────────────────────────────────────────────────
function buildFunctionsMd(schema) {
  const fs_ = functions.filter((f) => f.schema_name === schema).sort((a, b) => a.function_name.localeCompare(b.function_name));
  let md = `# \`${schema}\` — Funções e Procedures\n\n`;
  md += `> ${fs_.length} entradas | gerado ${NOW}\n\n`;
  md += `## Índice\n\n`;
  for (const f of fs_) {
    const sig = `${f.function_name}(${(f.arguments || "").slice(0, 80)})`;
    md += `- [\`${sig}\`](#${f.function_name.toLowerCase()})${f.security_definer ? " 🛡️" : ""}\n`;
  }
  md += `\n_🛡️ = SECURITY DEFINER_\n\n---\n\n`;

  for (const f of fs_) {
    md += `## ${f.function_name}\n\n`;
    md += `- **Tipo:** ${f.kind} (${f.language})${f.security_definer ? " — SECURITY DEFINER" : ""}\n`;
    md += `- **Argumentos:** \`${f.arguments || "(sem argumentos)"}\`\n`;
    md += `- **Retorno:** \`${f.return_type}\`\n`;
    md += `- **Volatility:** ${{ i: "IMMUTABLE", s: "STABLE", v: "VOLATILE" }[f.volatility] || f.volatility}\n`;
    if (f.description) md += `- **Comentário:** ${esc(f.description)}\n`;

    md += `\n<details><summary>Código-fonte completo</summary>\n\n\`\`\`sql\n${f.source_full || "-- (não disponível)"}\n\`\`\`\n\n</details>\n`;

    md += codeRefBlock([`${schema}.${f.function_name}`, f.function_name]);
    md += `\n---\n\n`;
  }
  write(`${schema}/functions.md`, md);
}

// ── triggers ─────────────────────────────────────────────────────────────
function buildTriggersMd(schema) {
  const ts = triggers.filter((t) => t.schema_name === schema).sort((a, b) =>
    (a.table_name + a.trigger_name).localeCompare(b.table_name + b.trigger_name)
  );
  let md = `# \`${schema}\` — Triggers\n\n`;
  md += `> ${ts.length} triggers | gerado ${NOW}\n\n`;
  md += `| Tabela | Trigger | Timing | Eventos | Função | Estado |\n|--------|---------|--------|---------|--------|--------|\n`;
  for (const t of ts) {
    const en = t.tgenabled === "D" ? "DISABLED" : t.tgenabled === "O" ? "ENABLED" : t.tgenabled;
    md += `| \`${t.table_name}\` | \`${t.trigger_name}\` | ${t.timing} | ${t.events.join(",")} | \`${t.function_full_name}\` | ${en} |\n`;
  }
  md += `\n## Definições completas\n\n`;
  for (const t of ts) {
    md += `### \`${t.table_name}.${t.trigger_name}\`\n\n`;
    md += `\`\`\`sql\n${t.definition}\n\`\`\`\n\n`;
  }
  write(`${schema}/triggers.md`, md);
}

// ── views ────────────────────────────────────────────────────────────────
function buildViewsMd(schema) {
  const vs = views.filter((v) => v.schema_name === schema).sort((a, b) => a.view_name.localeCompare(b.view_name));
  let md = `# \`${schema}\` — Views e Materialized Views\n\n`;
  md += `> ${vs.length} entradas | gerado ${NOW}\n\n`;
  md += `## Índice\n\n`;
  for (const v of vs)
    md += `- [\`${v.view_name}\`](#${v.view_name.toLowerCase()})${v.is_materialized ? " (MATVIEW)" : ""}\n`;
  md += `\n---\n\n`;

  for (const v of vs) {
    md += `## ${v.view_name}\n\n`;
    md += `${v.is_materialized ? "**MATERIALIZED VIEW** | " : ""}Owner: \`${v.owner}\`\n\n`;
    md += `\`\`\`sql\n${v.definition}\n\`\`\`\n`;
    md += codeRefBlock([`${schema}.${v.view_name}`, v.view_name]);
    md += `\n---\n\n`;
  }
  write(`${schema}/views.md`, md);
}

// ── RLS ──────────────────────────────────────────────────────────────────
function buildRlsMd(schema) {
  const ps = policies.filter((p) => p.schemaname === schema);
  const rs = rlsEnabled.filter((r) => r.schema_name === schema);
  const enabled = rs.filter((r) => r.rls_enabled);

  let md = `# \`${schema}\` — Row Level Security (RLS)\n\n`;
  md += `> ${ps.length} políticas em ${enabled.length} de ${rs.length} tabelas\n\n`;

  if (enabled.length) {
    md += `## Tabelas com RLS habilitada\n\n`;
    md += `| Tabela | RLS | Forced | # Policies |\n|---|---|---|---|\n`;
    for (const r of enabled) {
      const cnt = ps.filter((p) => p.tablename === r.table_name).length;
      md += `| \`${r.table_name}\` | ✓ | ${r.force_rls ? "✓" : "—"} | ${cnt} |\n`;
    }
  }

  if (ps.length) {
    md += `\n## Políticas\n\n`;
    const byTable = new Map();
    for (const p of ps) {
      if (!byTable.has(p.tablename)) byTable.set(p.tablename, []);
      byTable.get(p.tablename).push(p);
    }
    for (const [t, list] of byTable) {
      md += `### \`${t}\`\n\n`;
      for (const p of list) {
        md += `- **${p.policyname}** — ${p.cmd} (${p.permissive}) roles=\`${(p.roles || []).join(",")}\`\n`;
        if (p.qual) md += `  - USING: \`${esc(trimDef(p.qual, 300))}\`\n`;
        if (p.with_check) md += `  - WITH CHECK: \`${esc(trimDef(p.with_check, 300))}\`\n`;
      }
      md += `\n`;
    }
  }
  write(`${schema}/rls.md`, md);
}

// ── sequences ────────────────────────────────────────────────────────────
function buildSequencesMd(schema) {
  const ss = sequences.filter((s) => s.sequence_schema === schema);
  if (!ss.length) return;
  let md = `# \`${schema}\` — Sequences\n\n`;
  md += `> ${ss.length} sequences\n\n`;
  md += `| Nome | Tipo | Start | Min | Max | Increment | Cycle |\n|---|---|---|---|---|---|---|\n`;
  for (const s of ss)
    md += `| \`${s.sequence_name}\` | ${s.data_type} | ${s.start_value} | ${s.minimum_value} | ${s.maximum_value} | ${s.increment} | ${s.cycle_option} |\n`;
  write(`${schema}/sequences.md`, md);
}

// ── enums por schema ─────────────────────────────────────────────────────
function buildEnumsMd(schema) {
  const es = enums.filter((e) => e.schema_name === schema);
  if (!es.length) return;
  let md = `# \`${schema}\` — Enums\n\n`;
  md += `> ${es.length} tipos enum\n\n`;
  for (const e of es) {
    md += `## \`${e.type_name}\`\n\n`;
    md += e.values.map((v) => `- \`${v}\``).join("\n") + "\n\n";
  }
  write(`${schema}/enums.md`, md);
}

// ── 99 — summary executivo ───────────────────────────────────────────────
{
  let md = `# Resumo Executivo — Mapeamento Completo do Banco\n\n`;
  md += `> Data: ${NOW}\n\n`;
  md += `## Contagens por schema\n\n`;
  md += "```\n";
  let totals = { tables: 0, columns: 0, views: 0, functions: 0, triggers: 0, rls: 0, indexes: 0, sequences: 0, enums: 0 };
  for (const s of SCHEMAS) {
    const x = summary[s];
    md += `${s.padEnd(12)} | tabelas=${String(x.tables).padStart(3)} | colunas=${String(x.columns).padStart(4)} | views=${String(x.views + x.matviews).padStart(3)} | funcs=${String(x.functions).padStart(3)} | triggers=${String(x.triggers).padStart(3)} | rls=${String(x.rls_policies).padStart(3)} | indexes=${String(x.indexes).padStart(3)}\n`;
    totals.tables += x.tables; totals.columns += x.columns; totals.views += x.views + x.matviews;
    totals.functions += x.functions; totals.triggers += x.triggers; totals.rls += x.rls_policies;
    totals.indexes += x.indexes; totals.sequences += x.sequences; totals.enums += x.enums;
  }
  md += "```\n\n";
  md += `**Totais:** ${totals.tables} tabelas / ${totals.columns} colunas / ${totals.views} views / ${totals.functions} funções / ${totals.triggers} triggers / ${totals.rls} RLS policies / ${totals.indexes} indexes / ${totals.sequences} sequences / ${totals.enums} enums.\n\n`;

  md += `## Pontos críticos identificados\n\n`;

  md += `### 1. CLAUDE.md está desatualizado\n\n`;
  md += `| Afirmação CLAUDE.md | Realidade |\n|---|---|\n`;
  md += `| "alissonerp ~60 tabelas" | **139 tabelas** |\n`;
  md += `| "~35 views" | **71 views** |\n`;
  md += `| "~30 triggers" | **55 triggers** (alissonerp) |\n`;
  md += `| "fn_processar_transferencia_saida" (no-touch) | nome real é \`fn_processar_transferencia\` (sem "_saida") |\n\n`;
  md += `Recomenda-se atualizar o CLAUDE.md para refletir a realidade.\n\n`;

  md += `### 2. Schema \`crm\` não documentado\n\n`;
  md += `O schema \`crm\` tem **31 tabelas, 13 funções, 31 triggers e 41 RLS policies** mas:\n`;
  md += `- Não é mencionado no CLAUDE.md\n`;
  md += `- **Não tem nenhuma referência no código atual** do projeto fabricaAJ\n`;
  md += `- Conteúdo aparente: CRM com IA (\`agente_runs\`, \`agentes_ia\`, \`prompt_templates\`, \`sdr_runs\`), integração com canais (\`kommo_config\`, \`unipile_config\`, \`meta_config\`), funis de venda (\`funis\`, \`funil_etapas\`, \`oportunidades\`) e automações (\`automacoes\`, \`automacao_execucoes\`).\n`;
  md += `- Hipóteses: (a) projeto paralelo compartilhando o mesmo banco, (b) feature em planejamento, (c) integração externa não auditada. **Investigar com Jonathan.**\n\n`;

  md += `### 3. RLS é abundante mas pouco efetivo no fluxo principal\n\n`;
  md += `Existem **193 RLS policies** (114 só em \`public\`, 41 em \`crm\`, 38 em \`alissonerp\`). Como o backend acessa o banco via \`src/lib/db.ts\` com \`postgres.js\` (não usa o role autenticado do Supabase), a maioria dessas políticas é **bypass** silenciosamente. Elas só protegem clientes que entrem via PostgREST/Supabase JS com JWT.\n\n`;
  md += `Implicação: a segurança de fato vem das checagens em \`src/lib/permissoes.ts\` + \`requireAuth()\` + \`defineRoute({ requireRoles })\`. RLS é uma camada secundária.\n\n`;

  md += `### 4. \`directus\` é legado mas ainda referenciado\n\n`;
  md += `110 tabelas em \`directus\`, das quais ~95 são configuração da plataforma Directus. Apenas as tabelas de negócio (\`ordens\`, \`pcp\`, \`apontamento\`, \`controle_estoque\`, \`protocolo\`, \`distribuicao\`, \`compras\`, \`insumos\`) ainda são lidas pelo código (READONLY).\n\n`;

  md += `### 5. \`extensions\` tem 125 funções — todas de extensões instaladas\n\n`;
  md += `As funções pertencem a: \`pg_stat_statements\`, \`pgcrypto\`, \`uuid-ossp\`, \`pg_net\`, \`hypopg\`, \`http\`, \`unaccent\`, \`wrappers\`, \`index_advisor\`. Documentadas para completude, mas não devem ser modificadas.\n\n`;

  md += `### 6. Funções "no-touch" do CLAUDE.md — verificação\n\n`;
  md += `| Função (CLAUDE.md) | Status real |\n|---|---|\n`;
  const noTouch = ["fn_processar_apontamento_pcp","fn_processar_transferencia_saida","fn_processar_fechamento_dist","fn_concluir_protocolo","fn_processar_auditoria","fn_criar_servico_from_pcp","fn_calcular_peso_pedra_gramas"];
  for (const fn of noTouch) {
    const found = functions.find((x) => x.function_name === fn);
    let line = `\`${fn}\``;
    if (found) line += ` | ✓ presente em \`${found.schema_name}\``;
    else {
      // tentar encontrar nome semelhante
      const similar = functions.filter((x) => x.function_name.includes(fn.replace(/_saida$/, "").replace(/^fn_/, "")));
      if (similar.length) line += ` | ✗ NÃO existe; nome similar: \`${similar.map((s) => s.function_name).join("`, `")}\``;
      else line += ` | ✗ NÃO encontrada`;
    }
    md += `| ${line} |\n`;
  }

  md += `\n## Top 10 objetos mais referenciados no código\n\n`;
  if (codeRefs?.by_object_counts) {
    const top = Object.entries(codeRefs.by_object_counts).sort((a,b)=>b[1]-a[1]).slice(0, 10);
    md += `| # | Objeto | Hits |\n|--:|---|---:|\n`;
    top.forEach(([k, v], i) => (md += `| ${i+1} | \`${k}\` | ${v} |\n`));
    md += `\n_Nota: contagem por nome bruto — tabelas com nomes idênticos em schemas distintos (\`ordens\`, \`pcp\`) aparecem duplicadas. Ver \`99-code-mapping.md\` para detalhes._\n\n`;
  }

  md += `## Cobertura desta documentação\n\n`;
  md += `- ✅ Schemas mapeados: \`alissonerp\`, \`public\`, \`directus\`, \`crm\`, \`auth\`, \`storage\`, \`extensions\` (7 schemas)\n`;
  md += `- ✅ Tabelas: **${totals.tables}/377** mapeadas com colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS\n`;
  md += `- ✅ Colunas: **${totals.columns}** com tipo, nullable, default, comentário\n`;
  md += `- ✅ Funções/Procedures: **${totals.functions}** com assinatura, retorno e CORPO-FONTE COMPLETO em \`<schema>/functions.md\`\n`;
  md += `- ✅ Triggers: **${totals.triggers}** com função alvo, evento, timing, definição completa\n`;
  md += `- ✅ Views: **${totals.views}** com SQL completo\n`;
  md += `- ✅ RLS: **${totals.rls}** políticas em todos schemas (com qual + with_check)\n`;
  md += `- ✅ Indexes: **${totals.indexes}** com indexdef\n`;
  md += `- ✅ Sequences: **${totals.sequences}**\n`;
  md += `- ✅ Enums: **${totals.enums}** com valores\n`;
  md += `- ✅ Extensions: 13 instaladas\n`;
  md += `- ✅ Cross-reference banco ↔ código (1013 arquivos varridos, 8.1 MB)\n`;
  md += `- ✅ Migrations: 219 indexadas com summary\n\n`;

  md += `## Lacunas conhecidas (transparência)\n\n`;
  md += `- ⚠️ **Schemas Supabase internos** (\`_realtime\`, \`graphql\`, \`graphql_public\`, \`net\`, \`vault\`, \`cron\`, \`supabase_functions\`, \`realtime\`) não foram detalhados — são gerenciados pelo Supabase e não há expectativa de modificação.\n`;
  md += `- ⚠️ **Schema \`crm\`** está documentado estruturalmente mas o **propósito de negócio** depende de confirmação com o time.\n`;
  md += `- ⚠️ **Cross-reference por nome bruto** — para tabelas com nomes idênticos em múltiplos schemas, a contagem é inflada (sinalizado em cada arquivo).\n`;
  md += `- ⚠️ **Funções de \`extensions\`** (125) não têm descrição de propósito — são de bibliotecas externas, deve-se consultar a documentação da extensão.\n\n`;

  md += `## Como regenerar tudo do zero\n\n`;
  md += "```bash\n";
  md += "node scripts/_db_mapping_extract.mjs    # 1) extrai JSON crus em docs/db-mapping/_raw/ (~10s)\n";
  md += "node scripts/_db_mapping_code_xref.mjs  # 2) cross-reference banco↔código (~10s)\n";
  md += "node scripts/_db_mapping_build_docs.mjs # 3) constrói os MDs finais em docs/db-mapping/\n";
  md += "```\n";
  write("99-summary.md", md);
}

// ── 99 — code mapping ────────────────────────────────────────────────────
function buildCodeMappingMd() {
  if (!codeRefs) {
    write("99-code-mapping.md", "_Cross-reference indisponível — rode `node scripts/_db_mapping_code_xref.mjs` antes._\n");
    return;
  }
  let md = `# Mapeamento Banco ↔ Código\n\n`;
  md += `> Gerado em: ${codeRefs.generated_at}\n`;
  md += `> Arquivos de código varridos: **${codeRefs.files_scanned}** (${(codeRefs.total_bytes / 1e6).toFixed(1)} MB)\n`;
  md += `> Objetos buscados: **${codeRefs.objects_searched}** (tabelas + views + funções + triggers de \`alissonerp\`, \`public\`, \`directus\`, \`crm\`)\n\n`;
  md += `## Visão geral\n\n`;
  md += `| Métrica | Valor |\n|---|---:|\n`;
  md += `| Objetos com pelo menos 1 referência | **${codeRefs.objects_with_match}** |\n`;
  md += `| Objetos sem referência identificada | **${codeRefs.objects_without_match}** |\n`;
  md += `| Chamadas \`supabase.from(...)\` | ${codeRefs.supabase_from_calls.length} |\n`;
  md += `| Migrations indexadas | ${codeRefs.migrations.length} |\n\n`;

  md += `### Aviso sobre ambiguidade\n\n`;
  md += `O regex usa apenas o **nome** do objeto, não o schema. Quando o código escreve \`FROM ordens\`, o ` +
    `\`search_path = alissonerp,public\` (configurado em \`src/lib/db.ts\`) define que vai pra \`alissonerp.ordens\`. ` +
    `Mas a contagem aqui marca match para QUALQUER schema com esse nome de tabela. Tabelas com nomes idênticos em ` +
    `múltiplos schemas (\`ordens\`, \`pcp\`, \`protocolo\`, \`insumos\`, \`audit_log\`) terão a mesma contagem listada para cada schema.\n\n`;

  md += `## Top 30 objetos mais referenciados\n\n`;
  md += `| # | Objeto | Ocorrências |\n|--:|--------|------------:|\n`;
  const top30 = Object.entries(codeRefs.by_object_counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
  top30.forEach(([k, c], i) => (md += `| ${i + 1} | \`${k}\` | ${c} |\n`));

  md += `\n## Objetos SEM uso identificado no código\n\n`;
  md += `_Podem ser: (a) legado / dead code, (b) chamados via PostgREST por clientes externos, (c) usados apenas dentro de outras funções/views/triggers do banco, (d) chamados por sistemas externos não auditados._\n\n`;
  md += `### Quebra por schema\n\n`;
  for (const [s, c] of Object.entries(codeRefs.unused_by_schema || {})) {
    md += `- **${s}**: ${c} objeto(s) sem uso identificado\n`;
  }
  md += `\n### Quebra por tipo\n\n`;
  for (const [t, c] of Object.entries(codeRefs.unused_by_type || {})) {
    md += `- **${t}**: ${c}\n`;
  }
  md += `\n### Lista completa (sem uso identificado)\n\n`;
  md += `<details><summary>Mostrar ${codeRefs.unused_objects.length} objetos</summary>\n\n`;
  for (const k of codeRefs.unused_objects) md += `- \`${k}\`\n`;
  md += `\n</details>\n\n`;

  md += `## Chamadas \`supabase.from(...)\`\n\n`;
  if (codeRefs.supabase_from_calls.length === 0) {
    md += `_Nenhuma chamada encontrada — o ERP usa exclusivamente SQL direto via \`src/lib/db.ts\`._\n\n`;
  } else {
    md += `| Tabela | Arquivo | Linha |\n|---|---|---:|\n`;
    for (const c of codeRefs.supabase_from_calls)
      md += `| \`${c.table}\` | \`${c.file}\` | ${c.line} |\n`;
  }

  md += `\n## Migrations (${codeRefs.migrations.length})\n\n`;
  md += `<details><summary>Mostrar lista completa</summary>\n\n`;
  md += `| Arquivo | Resumo |\n|---|---|\n`;
  for (const m of codeRefs.migrations)
    md += `| \`${m.file}\` | ${esc(m.summary || "—")} |\n`;
  md += `\n</details>\n`;

  write("99-code-mapping.md", md);
}

// ── Build per schema ─────────────────────────────────────────────────────
for (const s of SCHEMAS) {
  console.log(`\n── ${s} ──`);
  buildTablesMd(s);
  buildFunctionsMd(s);
  buildTriggersMd(s);
  buildViewsMd(s);
  buildRlsMd(s);
  buildSequencesMd(s);
  buildEnumsMd(s);
}

buildCodeMappingMd();
console.log("\nFeito.");
