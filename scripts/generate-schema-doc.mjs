/**
 * generate-schema-doc.mjs
 * Extrai schema do banco PostgreSQL e gera documentação markdown em docs/schema/
 * Uso: node scripts/generate-schema-doc.mjs
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'docs', 'schema');

const CONNECTION_STRING =
  'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';

const NOW = new Date().toISOString().slice(0, 10);

// ─── helpers ───────────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  Gerado: ${path.relative(ROOT, filePath)}`);
}

// ─── queries ────────────────────────────────────────────────────────────────

async function getTables(client, schema) {
  const { rows } = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  );
  return rows.map((r) => r.table_name);
}

async function getViews(client, schema) {
  const { rows } = await client.query(
    `SELECT table_name, view_definition
     FROM information_schema.views
     WHERE table_schema = $1
     ORDER BY table_name`,
    [schema]
  );
  return rows;
}

async function getColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table]
  );
  return rows;
}

async function getFKs(client, schema, table) {
  const { rows } = await client.query(
    `SELECT kcu.column_name,
            ccu.table_schema || '.' || ccu.table_name || '.' || ccu.column_name AS ref
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
          USING (constraint_name, table_schema, table_name)
     JOIN information_schema.constraint_column_usage ccu
          USING (constraint_name, table_schema)
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = $1 AND tc.table_name = $2`,
    [schema, table]
  );
  return rows;
}

async function getIndexes(client, schema, table) {
  const { rows } = await client.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = $1 AND tablename = $2`,
    [schema, table]
  );
  return rows;
}

async function getTriggers(client, schema, table) {
  const { rows } = await client.query(
    `SELECT trigger_name, event_manipulation, action_timing
     FROM information_schema.triggers
     WHERE trigger_schema = $1 AND event_object_table = $2`,
    [schema, table]
  );
  return rows;
}

// ─── markdown builders ──────────────────────────────────────────────────────

async function buildTableMd(client, schema, table) {
  const [columns, fks, indexes, triggers] = await Promise.all([
    getColumns(client, schema, table),
    getFKs(client, schema, table),
    getIndexes(client, schema, table),
    getTriggers(client, schema, table),
  ]);

  let md = `## ${table}\n\n`;

  // Columns
  md += `| Coluna | Tipo | Nullable | Default |\n`;
  md += `|--------|------|----------|--------|\n`;
  for (const c of columns) {
    const tipo =
      c.character_maximum_length
        ? `${c.data_type}(${c.character_maximum_length})`
        : c.data_type;
    const def = c.column_default
      ? c.column_default.length > 60
        ? c.column_default.slice(0, 57) + '...'
        : c.column_default
      : '—';
    md += `| ${c.column_name} | ${tipo} | ${c.is_nullable} | ${def} |\n`;
  }

  // FKs
  if (fks.length > 0) {
    md += `\n**FKs:**\n`;
    for (const fk of fks) {
      md += `- \`${fk.column_name}\` → \`${fk.ref}\`\n`;
    }
  }

  // Indexes
  const nonPkIndexes = indexes.filter((i) => !i.indexname.endsWith('_pkey'));
  if (nonPkIndexes.length > 0) {
    md += `\n**Índices:**\n`;
    for (const idx of nonPkIndexes) {
      const def =
        idx.indexdef.length > 100
          ? idx.indexdef.slice(0, 97) + '...'
          : idx.indexdef;
      md += `- \`${idx.indexname}\` — ${def}\n`;
    }
  }

  // Triggers
  if (triggers.length > 0) {
    md += `\n**Triggers:**\n`;
    const seen = new Set();
    for (const t of triggers) {
      const key = `${t.trigger_name}|${t.action_timing}|${t.event_manipulation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      md += `- \`${t.trigger_name}\` (${t.action_timing} ${t.event_manipulation})\n`;
    }
  }

  return md + '\n---\n\n';
}

async function buildViewSummary(view) {
  const lines = (view.view_definition || '')
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 3);
  let md = `### ${view.table_name}\n\n`;
  md += '```sql\n' + lines.join('\n') + '\n...\n```\n\n';
  return md;
}

// ─── per-file generators ────────────────────────────────────────────────────

function matchesAny(name, keywords) {
  const n = name.toLowerCase();
  return keywords.some((k) => n.includes(k));
}

const GROUPS = {
  'alissonerp-vendas': ['venda', 'crediario', 'vale_troca', 'pagamento', 'contas_receber'],
  'alissonerp-pcp': ['pcp', 'distribuicao', 'apontamento', 'protocolo'],
  'alissonerp-estoque': ['movimentacao', 'insumo', 'deposito', 'estoque', 'purificacao'],
  'alissonerp-admin': ['usuario', 'audit', 'notificac', 'configurac', 'fila', 'tarefa', 'webhook', 'parametro'],
  'alissonerp-ordens': ['ordem', 'ficha', 'item', 'orcamento'],
};

async function generateAlisssonerpDocs(client, tables, views) {
  const counts = {};

  for (const [fileKey, keywords] of Object.entries(GROUPS)) {
    const matched = tables.filter((t) => matchesAny(t, keywords));
    counts[fileKey] = matched.length;

    let md = `# Schema alissonerp — ${fileKey.replace('alissonerp-', '')}\n\n`;
    md += `> Gerado em: ${NOW} | Tabelas: ${matched.length}\n\n`;

    if (matched.length === 0) {
      md += '_Nenhuma tabela encontrada para este grupo._\n';
    } else {
      for (const table of matched) {
        console.log(`    [${fileKey}] ${table}`);
        md += await buildTableMd(client, 'alissonerp', table);
      }
    }

    // Views relevantes
    const matchedViews = views.filter((v) => matchesAny(v.table_name, keywords));
    if (matchedViews.length > 0) {
      md += `## Views (${matchedViews.length})\n\n`;
      for (const v of matchedViews) {
        md += await buildViewSummary(v);
      }
    }

    write(path.join(OUTPUT_DIR, `${fileKey}.md`), md);
  }

  // tabelas não classificadas
  const allGrouped = Object.values(GROUPS).flat();
  const unmatched = tables.filter(
    (t) => !Object.values(GROUPS).some((kws) => matchesAny(t, kws))
  );

  if (unmatched.length > 0) {
    let md = `# Schema alissonerp — outros\n\n`;
    md += `> Gerado em: ${NOW} | Tabelas: ${unmatched.length}\n\n`;
    for (const table of unmatched) {
      console.log(`    [alissonerp-outros] ${table}`);
      md += await buildTableMd(client, 'alissonerp', table);
    }
    write(path.join(OUTPUT_DIR, 'alissonerp-outros.md'), md);
    counts['alissonerp-outros'] = unmatched.length;
  }

  return counts;
}

async function generatePublicDoc(client) {
  const tables = await getTables(client, 'public');
  const views = await getViews(client, 'public');
  let md = `# Schema public (READONLY)\n\n`;
  md += `> Gerado em: ${NOW} | Tabelas: ${tables.length} | Views: ${views.length}\n\n`;
  md += `> **READONLY** — não usar INSERT/UPDATE/DELETE neste schema\n\n`;

  for (const table of tables) {
    console.log(`    [public] ${table}`);
    md += await buildTableMd(client, 'public', table);
  }

  if (views.length > 0) {
    md += `## Views (${views.length})\n\n`;
    for (const v of views) {
      md += await buildViewSummary(v);
    }
  }

  write(path.join(OUTPUT_DIR, 'public.md'), md);
  return { tables: tables.length, views: views.length };
}

async function generateDirectusDoc(client) {
  const allTables = await getTables(client, 'directus');
  const tables = allTables.slice(0, 20); // limitar 20 tabelas
  const views = await getViews(client, 'directus');

  let md = `# Schema directus (READONLY)\n\n`;
  md += `> Gerado em: ${NOW} | Total tabelas: ${allTables.length} (mostrando primeiras ${tables.length}) | Views: ${views.length}\n\n`;
  md += `> **READONLY** — schema legado, não modificar\n\n`;

  if (allTables.length > 20) {
    md += `> **Nota:** Schema tem ${allTables.length} tabelas. Documentadas apenas as primeiras 20 por volume.\n\n`;
    md += `> Tabelas omitidas: ${allTables.slice(20).join(', ')}\n\n`;
  }

  for (const table of tables) {
    console.log(`    [directus] ${table}`);
    md += await buildTableMd(client, 'directus', table);
  }

  if (views.length > 0) {
    md += `## Views (${views.length})\n\n`;
    for (const v of views) {
      md += await buildViewSummary(v);
    }
  }

  write(path.join(OUTPUT_DIR, 'directus.md'), md);
  return { tables: tables.length, totalTables: allTables.length, views: views.length };
}

// ─── README ─────────────────────────────────────────────────────────────────

function generateReadme(stats) {
  let md = `# docs/schema — Índice de Documentação de Schema\n\n`;
  md += `> Gerado automaticamente por \`scripts/generate-schema-doc.mjs\`\n`;
  md += `> Data: ${NOW}\n\n`;

  md += `## Arquivos\n\n`;
  md += `| Arquivo | Descrição | Tabelas | Views |\n`;
  md += `|---------|-----------|---------|-------|\n`;

  const files = [
    { file: 'alissonerp-vendas.md', desc: 'Vendas, crediário, vale-troca, pagamentos, contas a receber', tables: stats['alissonerp-vendas'] ?? 0, views: 0 },
    { file: 'alissonerp-pcp.md', desc: 'PCP, distribuição, apontamentos, protocolo', tables: stats['alissonerp-pcp'] ?? 0, views: 0 },
    { file: 'alissonerp-estoque.md', desc: 'Movimentações, insumos, depósitos, estoque, purificação', tables: stats['alissonerp-estoque'] ?? 0, views: 0 },
    { file: 'alissonerp-admin.md', desc: 'Usuários, auditoria, notificações, configurações, filas, webhooks', tables: stats['alissonerp-admin'] ?? 0, views: 0 },
    { file: 'alissonerp-ordens.md', desc: 'Ordens, fichas técnicas, itens, orçamentos', tables: stats['alissonerp-ordens'] ?? 0, views: 0 },
    { file: 'alissonerp-outros.md', desc: 'Demais tabelas alissonerp não classificadas', tables: stats['alissonerp-outros'] ?? 0, views: 0 },
    { file: 'public.md', desc: 'Schema public (contatos, vendedores, produtos, vendas) — READONLY', tables: stats.public?.tables ?? 0, views: stats.public?.views ?? 0 },
    { file: 'directus.md', desc: `Schema directus legado — READONLY (${stats.directus?.totalTables ?? '?'} tabelas, mostrando ${stats.directus?.tables ?? 20})`, tables: stats.directus?.tables ?? 0, views: stats.directus?.views ?? 0 },
  ];

  for (const f of files) {
    md += `| [${f.file}](./${f.file}) | ${f.desc} | ${f.tables} | ${f.views} |\n`;
  }

  const totalTables = files.reduce((s, f) => s + f.tables, 0);
  md += `\n**Total documentado:** ${totalTables} tabelas\n\n`;

  md += `## Schemas\n\n`;
  md += `| Schema | Acesso | Observação |\n`;
  md += `|--------|--------|------------|\n`;
  md += `| \`alissonerp\` | Leitura + Escrita | ~60 tabelas, ~35 views, ~30 triggers — ERP fábrica |\n`;
  md += `| \`public\` | READONLY | contatos (=clientes), vendedores, produtos, vendas, user_profiles |\n`;
  md += `| \`directus\` | READONLY | ordens, pcp, apontamento, controle_estoque, protocolo (legado) |\n\n`;

  md += `## Como regenerar\n\n`;
  md += '```bash\n';
  md += 'node scripts/generate-schema-doc.mjs\n';
  md += '```\n\n';

  md += `## Notas\n\n`;
  md += `- \`NUNCA\` usar \`supabase.from()\` para schema \`alissonerp\` — usa SQL direto via \`src/lib/db.ts\`\n`;
  md += `- Schemas \`public\` e \`directus\` são READONLY — sem INSERT/UPDATE/DELETE\n`;
  md += `- PKs reais: \`contatos.id_contato\`, \`public.produtos.id_produto\`\n`;
  md += `- Typo legado: \`directus.ordens.peso_metal_negocido\` (sem "a")\n`;

  return md;
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Conectando ao banco...');
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  console.log('Conectado.\n');

  const stats = {};

  // alissonerp
  console.log('Extraindo tabelas alissonerp...');
  const alissonTables = await getTables(client, 'alissonerp');
  const alissonViews = await getViews(client, 'alissonerp');
  console.log(`  ${alissonTables.length} tabelas, ${alissonViews.length} views\n`);

  console.log('Gerando docs alissonerp...');
  const alissonCounts = await generateAlisssonerpDocs(client, alissonTables, alissonViews);
  Object.assign(stats, alissonCounts);
  console.log('');

  // public
  console.log('Gerando docs public...');
  stats.public = await generatePublicDoc(client);
  console.log('');

  // directus
  console.log('Gerando docs directus...');
  stats.directus = await generateDirectusDoc(client);
  console.log('');

  // README
  console.log('Gerando README...');
  write(path.join(OUTPUT_DIR, 'README.md'), generateReadme(stats));

  await client.end();

  console.log('\n=== Concluído ===');
  console.log(`Arquivos em: docs/schema/`);
  console.log('Stats:', JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error('ERRO:', err);
  process.exit(1);
});
