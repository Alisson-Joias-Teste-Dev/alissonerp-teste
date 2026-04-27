// ============================================================================
// migrate_directus_images.mjs
// ----------------------------------------------------------------------------
// Copia imagens do Directus legado para o bucket Supabase 'imagens' e popula
// alissonerp.produto_imagens.
//
// Fontes (em ordem de prioridade para a CAPA):
//   1. public.produtos.imagem_capa  → eh_capa=true, ordem=0
//   2. directus.produtos_files_1    → ordem 10+
//   3. directus.produtos_files      → ordem 500+
//   4. directus.produtos_files_2    → ordem 1000+
//   5. directus.produtos_files_3    → ordem 2000+
//
// Variações (alissonerp.erp_produtos.eh_variacao=true) são PULADAS — elas
// herdam as imagens do pai via vw_produto_capa.
//
// Idempotente: origem_uuid é UNIQUE — re-rodar não duplica.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate_directus_images.mjs --pilot=50
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate_directus_images.mjs --limit=200
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate_directus_images.mjs --dry
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate_directus_images.mjs   # bulk completo
//
// Flags:
//   --pilot=N         migra só N produtos (sorteados, ids menores primeiro)
//   --limit=N         máx N imagens (independente de produtos)
//   --dry             não baixa, não envia, não insere — só conta e loga
//   --concurrency=N   downloads/uploads paralelos (default 8)
//   --produto=ID      migra um produto específico (debug)
//   --include-variations  inclui variações (default: pula)
// ============================================================================

import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// carrega .env.local manualmente (sem dotenv)
const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────
const DB_URL  = process.env.DATABASE_URL  ?? 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://api.alisson.api.br';
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DIRECTUS_BASE = process.env.DIRECTUS_BASE_URL ?? 'https://base.alissonranyel.com.br';
const BUCKET = 'imagens';
const ERROR_LOG = resolve(__dirname, 'migrate_directus_images.errors.csv');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const PILOT       = args.pilot ? Number(args.pilot) : null;
const LIMIT       = args.limit ? Number(args.limit) : null;
const DRY         = !!args.dry;
const CONCURRENCY = args.concurrency ? Number(args.concurrency) : 8;
const PRODUTO_ID  = args.produto ? Number(args.produto) : null;
const INCLUDE_VAR = !!args['include-variations'];

const args2 = process.argv.slice(2).join(' ');
const NEED_KEY = !args2.includes('--dry');
if (NEED_KEY && !SB_KEY) {
  console.error('❌ Sem chave Supabase (SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY). Use --dry pra simular sem upload.');
  process.exit(1);
}

const sql = postgres(DB_URL, { ssl: false, max: 4 });
const supabase = SB_KEY ? createClient(SB_URL, SB_KEY) : null;

// ─── Util ───────────────────────────────────────────────────────────────────
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function logError(produtoId, uuid, stage, msg) {
  if (!existsSync(ERROR_LOG)) {
    writeFileSync(ERROR_LOG, 'timestamp,produto_id,uuid,stage,error\n');
  }
  appendFileSync(ERROR_LOG, `${new Date().toISOString()},${produtoId},${uuid},${stage},"${String(msg).replace(/"/g, '""')}"\n`);
}

let DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN ?? null;
async function ensureDirectusToken() {
  if (DIRECTUS_TOKEN) return;
  const r = await sql`
    SELECT u.token FROM directus.directus_users u
    LEFT JOIN directus.directus_roles r ON r.id = u.role
    WHERE u.token IS NOT NULL AND r.name = 'Administrator'
    LIMIT 1`;
  if (!r.length) throw new Error('Sem token de admin no Directus. Defina DIRECTUS_TOKEN.');
  DIRECTUS_TOKEN = r[0].token;
  log('🔑 Token Directus obtido do banco (admin)');
}

async function downloadDirectus(uuid, retries = 3) {
  const url = `${DIRECTUS_BASE}/assets/${uuid}`;
  const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct  = res.headers.get('content-type') ?? 'image/jpeg';
      return { buf, ct };
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
}

async function uploadSupabase(produtoId, uuid, buf, mime) {
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpeg';
  const path = `produtos/${produtoId}/${uuid}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mime, upsert: true });
  if (error) throw error;
  const url = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return { path, url, ext };
}

// ─── Pipeline por produto ───────────────────────────────────────────────────
async function processarProduto(produto) {
  const { id_produto, imagem_capa, fontes } = produto;
  // fontes = [{ uuid, ordem, origem_tabela, filename, mime, filesize }]
  const stats = { inseridas: 0, puladas: 0, erros: 0 };

  // Decide capa: prioridade pelo menor 'ordem' (já vem ordenada na query)
  const capaUuid = imagem_capa ?? fontes[0]?.uuid ?? null;

  for (const f of fontes) {
    try {
      // já existe? (idempotência)
      const exists = await sql`SELECT 1 FROM alissonerp.produto_imagens WHERE origem_uuid = ${f.uuid}`;
      if (exists.length) { stats.puladas++; continue; }

      if (DRY) { stats.inseridas++; continue; }

      const { buf, ct } = await downloadDirectus(f.uuid);
      const mime = f.mime ?? ct;
      const { path, url } = await uploadSupabase(id_produto, f.uuid, buf, mime);

      await sql`
        INSERT INTO alissonerp.produto_imagens
          (produto_id, bucket, bucket_path, url_publica, ordem, eh_capa,
           origem, origem_uuid, origem_tabela, filename, mime_type, filesize)
        VALUES
          (${id_produto}, ${BUCKET}, ${path}, ${url}, ${f.ordem},
           ${f.uuid === capaUuid}, 'directus', ${f.uuid}, ${f.origem_tabela},
           ${f.filename}, ${mime}, ${buf.length})
        ON CONFLICT (origem_uuid) DO NOTHING
      `;
      stats.inseridas++;
    } catch (e) {
      stats.erros++;
      logError(id_produto, f.uuid, 'process', e.message ?? String(e));
    }
  }

  return stats;
}

function poolMap(items, n, fn) {
  return new Promise((resolveAll, reject) => {
    const out = []; let i = 0, active = 0, done = 0;
    const next = () => {
      if (done === items.length) return resolveAll(out);
      while (active < n && i < items.length) {
        const idx = i++; active++;
        Promise.resolve(fn(items[idx], idx))
          .then(r => { out[idx] = r; })
          .catch(e => reject(e))
          .finally(() => { active--; done++; next(); });
      }
    };
    next();
  });
}

// ─── Coleta de fontes ───────────────────────────────────────────────────────
async function coletarProdutos() {
  // 1) lista produtos elegíveis
  let produtosFilter = sql``;
  if (PRODUTO_ID) {
    produtosFilter = sql`WHERE p.id_produto = ${PRODUTO_ID}`;
  } else if (!INCLUDE_VAR) {
    produtosFilter = sql`
      WHERE NOT EXISTS (
        SELECT 1 FROM alissonerp.erp_produtos ep
        WHERE ep.produto_id = p.id_produto AND ep.eh_variacao
      )`;
  }

  const limitClause = PILOT ? sql`LIMIT ${PILOT}` : sql``;

  // produtos que têm pelo menos uma fonte de imagem (capa OU junções)
  const produtos = await sql`
    SELECT p.id_produto, p.imagem_capa
    FROM public.produtos p
    ${produtosFilter}
    AND (
      p.imagem_capa IS NOT NULL OR
      EXISTS (SELECT 1 FROM directus.produtos_files   pf WHERE pf.produtos_id_produto = p.id_produto) OR
      EXISTS (SELECT 1 FROM directus.produtos_files_1 pf WHERE pf.produtos_id_produto = p.id_produto) OR
      EXISTS (SELECT 1 FROM directus.produtos_files_2 pf WHERE pf.produtos_id_produto = p.id_produto) OR
      EXISTS (SELECT 1 FROM directus.produtos_files_3 pf WHERE pf.produtos_id_produto = p.id_produto)
    )
    ORDER BY p.id_produto
    ${limitClause}
  `;

  // 2) para cada produto, montar lista de fontes ordenadas
  const ids = produtos.map(p => p.id_produto);
  if (!ids.length) return [];

  // tudo em uma query agregada para evitar N+1
  const fontes = await sql`
    SELECT produto_id, uuid, ordem, origem_tabela, filename, mime, filesize FROM (
      -- imagem_capa do public.produtos: ordem 0, prioridade absoluta para capa
      SELECT p.id_produto::bigint AS produto_id,
             p.imagem_capa AS uuid,
             0 AS ordem,
             'imagem_capa' AS origem_tabela,
             df.filename_download AS filename,
             df.type AS mime,
             df.filesize::bigint AS filesize
        FROM public.produtos p
        LEFT JOIN directus.directus_files df ON df.id = p.imagem_capa
       WHERE p.id_produto = ANY(${ids}) AND p.imagem_capa IS NOT NULL

      UNION ALL
      -- produtos_files_1: galeria principal (10+)
      SELECT pf.produtos_id_produto::bigint, pf.directus_files_id::uuid,
             10 + ROW_NUMBER() OVER (PARTITION BY pf.produtos_id_produto ORDER BY pf.id)::int AS ordem,
             'produtos_files_1', df.filename_download, df.type, df.filesize::bigint
        FROM directus.produtos_files_1 pf
        LEFT JOIN directus.directus_files df ON df.id = pf.directus_files_id
       WHERE pf.produtos_id_produto = ANY(${ids})

      UNION ALL
      SELECT pf.produtos_id_produto::bigint, pf.directus_files_id::uuid,
             500 + ROW_NUMBER() OVER (PARTITION BY pf.produtos_id_produto ORDER BY pf.id)::int,
             'produtos_files', df.filename_download, df.type, df.filesize::bigint
        FROM directus.produtos_files pf
        LEFT JOIN directus.directus_files df ON df.id = pf.directus_files_id
       WHERE pf.produtos_id_produto = ANY(${ids})

      UNION ALL
      SELECT pf.produtos_id_produto::bigint, pf.directus_files_id::uuid,
             1000 + ROW_NUMBER() OVER (PARTITION BY pf.produtos_id_produto ORDER BY pf.id)::int,
             'produtos_files_2', df.filename_download, df.type, df.filesize::bigint
        FROM directus.produtos_files_2 pf
        LEFT JOIN directus.directus_files df ON df.id = pf.directus_files_id
       WHERE pf.produtos_id_produto = ANY(${ids})

      UNION ALL
      SELECT pf.produtos_id_produto::bigint, pf.directus_files_id::uuid,
             2000 + ROW_NUMBER() OVER (PARTITION BY pf.produtos_id_produto ORDER BY pf.id)::int,
             'produtos_files_3', df.filename_download, df.type, df.filesize::bigint
        FROM directus.produtos_files_3 pf
        LEFT JOIN directus.directus_files df ON df.id = pf.directus_files_id
       WHERE pf.produtos_id_produto = ANY(${ids})
    ) all_sources
    ORDER BY produto_id, ordem
  `;

  // agrupa fontes por produto
  const byProduto = new Map(produtos.map(p => [String(p.id_produto), { ...p, fontes: [] }]));
  let total = 0;
  for (const f of fontes) {
    const p = byProduto.get(String(f.produto_id));
    if (p) {
      if (LIMIT && total >= LIMIT) break;
      p.fontes.push(f);
      total++;
    }
  }
  return [...byProduto.values()].filter(p => p.fontes.length > 0);
}

// ─── Main ───────────────────────────────────────────────────────────────────
(async () => {
  log(`Modo: ${DRY ? 'DRY' : 'LIVE'} | piloto=${PILOT ?? '∞'} | limit=${LIMIT ?? '∞'} | conc=${CONCURRENCY} | inclVar=${INCLUDE_VAR}`);
  if (!DRY) await ensureDirectusToken();
  log('Coletando produtos e fontes...');
  const produtos = await coletarProdutos();
  const totalImg = produtos.reduce((s, p) => s + p.fontes.length, 0);
  log(`→ ${produtos.length} produtos, ${totalImg} imagens a processar`);

  if (DRY) {
    log('DRY: amostra dos 3 primeiros:');
    produtos.slice(0, 3).forEach(p => {
      log(`  produto ${p.id_produto} (capa=${p.imagem_capa ?? '-'}): ${p.fontes.length} imgs`);
      p.fontes.forEach(f => log(`    ord=${f.ordem} ${f.origem_tabela} ${f.uuid}`));
    });
  }

  let inseridas = 0, puladas = 0, erros = 0, processados = 0;
  await poolMap(produtos, CONCURRENCY, async (p) => {
    const s = await processarProduto(p);
    inseridas += s.inseridas; puladas += s.puladas; erros += s.erros;
    processados++;
    if (processados % 50 === 0 || processados === produtos.length) {
      log(`progresso ${processados}/${produtos.length} | inseridas=${inseridas} puladas=${puladas} erros=${erros}`);
    }
  });

  log('═'.repeat(60));
  log(`✅ FIM | produtos=${processados} | inseridas=${inseridas} | puladas=${puladas} | erros=${erros}`);
  if (erros > 0) log(`⚠️  Erros logados em: ${ERROR_LOG}`);

  await sql.end();
})().catch(e => { console.error('❌ FATAL:', e); process.exit(1); });
