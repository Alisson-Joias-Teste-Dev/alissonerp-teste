/**
 * Auditoria completa do site WooCommerce cruzando com dados do ERP.
 * Gera relatório por categoria: infra, produtos, estoque, preços, SEO.
 *
 * Uso: DATABASE_URL=... node scripts/audit_site.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { ssl: false });

function ok(s)   { console.log(`  \x1b[32m✓\x1b[0m ${s}`); }
function warn(s) { console.log(`  \x1b[33m⚠\x1b[0m ${s}`); }
function err(s)  { console.log(`  \x1b[31m✗\x1b[0m ${s}`); }
function info(s) { console.log(`  • ${s}`); }
function h1(s)   { console.log(`\n\x1b[1;36m━━━ ${s} ━━━\x1b[0m`); }
function h2(s)   { console.log(`\n\x1b[1m${s}\x1b[0m`); }

const [cfg] = await sql`SELECT site_url, consumer_key, consumer_secret, ativo, sincronizar_preco, sincronizar_estoque FROM alissonerp.site_config WHERE id=1`;
if (!cfg || !cfg.site_url) { console.error("Sem config — rode a sync primeiro"); process.exit(1); }
const base = cfg.site_url.replace(/\/+$/, "");
const auth = Buffer.from(`${cfg.consumer_key}:${cfg.consumer_secret}`).toString("base64");

async function wcFetch(path) {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

// ─── 1. INFRAESTRUTURA ───────────────────────────────────────────────────
h1("1. INFRAESTRUTURA");
const sys = await wcFetch("/wp-json/wc/v3/system_status");
const env = sys.environment ?? {};
info(`URL: ${env.site_url ?? base}`);
info(`WordPress: ${env.version ?? "?"}`);
info(`WooCommerce: ${env.wc_version ?? "?"}`);
info(`PHP: ${env.php_version ?? "?"}`);
info(`MySQL: ${env.mysql_version ?? "?"}`);
info(`Tema: ${sys.theme?.name ?? "?"} ${sys.theme?.version ?? ""}`);
info(`HTTPS: ${env.https ? "sim" : "NÃO"}`);
info(`Memory limit: ${env.wp_memory_limit ?? "?"}`);
info(`Max upload: ${env.max_upload_size ?? "?"} bytes`);
info(`Plugins ativos: ${sys.active_plugins?.length ?? 0}`);

if (!env.https) err("HTTPS desabilitado — inseguro e bloqueia algumas APIs");
if (env.wp_memory_limit && parseInt(env.wp_memory_limit) < 256) warn(`Memory limit baixo (${env.wp_memory_limit})`);

// ─── 2. CATEGORIAS ─────────────────────────────────────────────────────────
h1("2. CATEGORIAS DA LOJA");
const cats = await wcFetch("/wp-json/wc/v3/products/categories?per_page=100");
info(`Total: ${cats.length} categorias`);
const catsVazias = cats.filter(c => c.count === 0);
if (catsVazias.length > 0) warn(`${catsVazias.length} categoria(s) sem produtos: ${catsVazias.slice(0,5).map(c=>c.name).join(", ")}${catsVazias.length>5?"...":""}`);
const catsNoFoto = cats.filter(c => !c.image);
if (catsNoFoto.length > 0) warn(`${catsNoFoto.length} categoria(s) sem imagem de destaque`);
ok(`Top 5 por produtos: ${cats.sort((a,b)=>b.count-a.count).slice(0,5).map(c=>`${c.name}(${c.count})`).join(" · ")}`);

// ─── 3. AMOSTRA DE PRODUTOS (100 primeiros) ────────────────────────────────
h1("3. PRODUTOS NO SITE (amostra de 100)");
const prods = await wcFetch("/wp-json/wc/v3/products?per_page=100");
const total = prods.length;
info(`Amostra: ${total} produtos`);

const semImagem = prods.filter(p => !p.images || p.images.length === 0);
const semDescricao = prods.filter(p => !p.description || p.description.trim().length < 30);
const semCategoria = prods.filter(p => !p.categories || p.categories.length === 0);
const semSku = prods.filter(p => !p.sku || !p.sku.trim());
const semPreco = prods.filter(p => p.type === "simple" && (!p.regular_price || parseFloat(p.regular_price) === 0));
const forStockVar = prods.filter(p => p.type === "variable" && !p.variations?.length);
const rascunhos = prods.filter(p => p.status === "draft");
const privados = prods.filter(p => p.status === "private");
const semEstoqueControle = prods.filter(p => !p.manage_stock && p.type === "simple");
const outofstock = prods.filter(p => p.stock_status === "outofstock");

if (semImagem.length) err(`${semImagem.length} SEM IMAGEM (${semImagem.slice(0,3).map(p=>p.sku).join(", ")}${semImagem.length>3?"...":""})`);
if (semDescricao.length) warn(`${semDescricao.length} com descrição curta ou vazia (impacta SEO)`);
if (semCategoria.length) err(`${semCategoria.length} sem categoria (cliente não acha pela nav)`);
if (semSku.length) err(`${semSku.length} SEM SKU (sync quebra, impossível mapear)`);
if (semPreco.length) err(`${semPreco.length} produtos SIMPLE sem preço`);
if (forStockVar.length) warn(`${forStockVar.length} produtos VARIABLE sem variações (incompleto)`);
if (rascunhos.length) info(`${rascunhos.length} em rascunho (não publicados)`);
if (privados.length) info(`${privados.length} privados`);
if (semEstoqueControle.length) warn(`${semEstoqueControle.length} simples sem controle de estoque ativado`);
if (outofstock.length) info(`${outofstock.length} marcados como esgotado`);

// ─── 4. CRUZAMENTO ERP × SITE ──────────────────────────────────────────────
h1("4. CRUZAMENTO ERP × SITE");
const skusWC = new Set(prods.map(p => p.sku).filter(Boolean));
const skusERP = await sql`
  SELECT p.sku, p.nome,
         COALESCE(NULLIF(p.preco_sync::numeric, 0),
                  CASE WHEN p.peso_precificado > 0 AND p.markup > 0 AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
                       THEN ROUND(p.peso_precificado::numeric * (SELECT ouro FROM public.parametros LIMIT 1)::numeric * p.markup::numeric * COALESCE(p.fator::numeric, 1) / 10)::numeric * 10
                  END,
                  NULLIF(p.preco_tiny::numeric, 0), 0)::int AS preco_erp,
         COALESCE(e.saldo, 0)::int AS saldo
  FROM public.produtos p
  LEFT JOIN public.estoque e ON e.sku = p.sku
  WHERE p.situacao = 'A' AND p.sku = ANY(${[...skusWC]})
`;
const mapERP = new Map(skusERP.map(r => [r.sku, r]));

const divPreco = [];
const divEstoque = [];
for (const p of prods) {
  if (p.type !== "simple") continue;
  const erp = mapERP.get(p.sku);
  if (!erp) continue;
  const precoWC = parseFloat(p.regular_price || "0");
  if (erp.preco_erp > 0 && Math.abs(erp.preco_erp - precoWC) > 1) {
    divPreco.push({ sku: p.sku, wc: precoWC, erp: erp.preco_erp });
  }
  if (p.manage_stock && erp.saldo !== p.stock_quantity) {
    divEstoque.push({ sku: p.sku, wc: p.stock_quantity, erp: erp.saldo });
  }
}
if (divPreco.length) warn(`${divPreco.length} produto(s) com DIVERGÊNCIA de preço entre ERP e site (primeiros 5):`);
divPreco.slice(0, 5).forEach(d => info(`  ${d.sku}: site R$ ${d.wc} vs ERP R$ ${d.erp}`));
if (divEstoque.length) warn(`${divEstoque.length} com DIVERGÊNCIA de estoque (primeiros 5):`);
divEstoque.slice(0, 5).forEach(d => info(`  ${d.sku}: site ${d.wc} vs ERP ${d.erp}`));

// Produtos no site mas não no ERP
const orfaosSite = [...skusWC].filter(sku => !mapERP.has(sku));
if (orfaosSite.length) warn(`${orfaosSite.length} produto(s) no site sem correspondência ATIVA no ERP (SKU órfão)`);

// Produtos no ERP ativos mas não no site
const [totAtivos] = await sql`
  SELECT COUNT(*)::int AS n FROM public.produtos p
  LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
  WHERE p.situacao='A' AND (ep.eh_variacao=false OR ep.id IS NULL)
    AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Insumos%')
    AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Matérias Primas%')
    AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruário%')
`;
info(`ERP tem ${totAtivos.n} produtos ativos (pais+simples, fora de Insumos/MP/Mostruário)`);
info(`Site tem amostra de ${total} produtos · total real pode ser maior`);

// ─── 5. PRODUTOS VARIÁVEIS (estrutura) ─────────────────────────────────────
h1("5. PRODUTOS VARIÁVEIS");
const vars = prods.filter(p => p.type === "variable");
info(`Total na amostra: ${vars.length}`);
let varsSemEstoqueVar = 0;
let varsPrecoDivergente = 0;
for (const p of vars.slice(0, 10)) {
  try {
    const variacoes = await wcFetch(`/wp-json/wc/v3/products/${p.id}/variations?per_page=100`);
    const semEstoque = variacoes.filter(v => !v.manage_stock).length;
    if (semEstoque > 0) varsSemEstoqueVar += 1;
    const precos = variacoes.map(v => parseFloat(v.regular_price || "0")).filter(n => n > 0);
    if (precos.length > 0) {
      const min = Math.min(...precos);
      const max = Math.max(...precos);
      if (max - min > min * 0.5) varsPrecoDivergente += 1;
    }
  } catch { /* skip */ }
}
if (varsSemEstoqueVar) warn(`${varsSemEstoqueVar}/10 produtos variáveis com variação(ões) sem controle de estoque`);
if (varsPrecoDivergente) info(`${varsPrecoDivergente}/10 produtos variáveis com preços muito diferentes entre variações (>50%)`);

// ─── 6. STATUS DA SYNC NO ERP ──────────────────────────────────────────────
h1("6. ESTADO DA SINCRONIZAÇÃO");
const [syncStats] = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE publicado_no_site = true)::int AS publicados,
    COUNT(*) FILTER (WHERE status_sync = 'ok')::int AS ok,
    COUNT(*) FILTER (WHERE status_sync = 'pendente')::int AS pendentes,
    COUNT(*) FILTER (WHERE status_sync = 'erro')::int AS erros,
    COUNT(*) FILTER (WHERE wc_product_id IS NOT NULL)::int AS mapeados
  FROM alissonerp.site_produtos
`;
info(`Mapeados ERP↔WC: ${syncStats.mapeados}`);
info(`Publicados: ${syncStats.publicados} · OK: ${syncStats.ok} · Pendentes: ${syncStats.pendentes} · Erros: ${syncStats.erros}`);

const errosRecentes = await sql`
  SELECT sku, ultimo_erro FROM alissonerp.site_produtos
  WHERE status_sync = 'erro' AND ultimo_erro IS NOT NULL
  ORDER BY ultima_tentativa_at DESC LIMIT 5
`;
if (errosRecentes.length) {
  h2("Últimos erros de sync:");
  errosRecentes.forEach(e => err(`${e.sku}: ${e.ultimo_erro.slice(0, 150)}`));
}

// ─── 7. RECOMENDAÇÕES FINAIS ───────────────────────────────────────────────
h1("7. RECOMENDAÇÕES PRIORIZADAS");
const recs = [];
if (semImagem.length > 0)       recs.push(["ALTA", `Adicionar imagens aos ${semImagem.length} produtos sem foto (quebra UX e Google Shopping)`]);
if (semCategoria.length > 0)    recs.push(["ALTA", `Classificar ${semCategoria.length} produtos sem categoria`]);
if (semPreco.length > 0)        recs.push(["ALTA", `Corrigir ${semPreco.length} produtos simples sem preço (invisíveis pra comprar)`]);
if (divPreco.length > 0)        recs.push(["ALTA", `Resolver ${divPreco.length} divergências de preço ERP/site via "Reenviar"`]);
if (divEstoque.length > 0)      recs.push(["ALTA", `Resolver ${divEstoque.length} divergências de estoque via sync`]);
if (orfaosSite.length > 0)      recs.push(["MÉDIA", `Revisar ${orfaosSite.length} SKUs no site que não existem no ERP ativo`]);
if (semDescricao.length > 0)    recs.push(["MÉDIA", `Enriquecer descrição de ${semDescricao.length} produtos (SEO)`]);
if (forStockVar.length > 0)     recs.push(["MÉDIA", `Completar ${forStockVar.length} produtos VARIABLE sem variações`]);
if (rascunhos.length > 0)       recs.push(["BAIXA", `Publicar ou excluir ${rascunhos.length} rascunhos`]);
if (syncStats.erros > 0)        recs.push(["ALTA", `Investigar ${syncStats.erros} produto(s) com erro de sync (ver mensagens acima)`]);
if (!env.https)                 recs.push(["CRÍTICA", "Migrar site para HTTPS"]);

if (recs.length === 0) {
  ok("Nenhum problema crítico encontrado na amostra!");
} else {
  const prioridade = { CRÍTICA: 4, ALTA: 3, MÉDIA: 2, BAIXA: 1 };
  recs.sort((a, b) => prioridade[b[0]] - prioridade[a[0]]);
  for (const [p, msg] of recs) {
    const cor = p === "CRÍTICA" ? "\x1b[1;31m" : p === "ALTA" ? "\x1b[31m" : p === "MÉDIA" ? "\x1b[33m" : "\x1b[36m";
    console.log(`  ${cor}[${p}]\x1b[0m ${msg}`);
  }
}

console.log("");
await sql.end();
