/**
 * Helpers para integração com a REST API do WooCommerce (v3).
 *
 * Estratégia de sync resiliente:
 *   1. Se já sabemos o wc_product_id (campo mapeado em site_produtos), faz PUT direto.
 *   2. Caso contrário, tenta GET /products?sku=<sku> para descobrir se já existe
 *      um produto com esse SKU no site.
 *   3. Se achou, faz PUT; se não, POST.
 *   4. Se o POST retornar `product_invalid_sku` com `resource_id` no corpo
 *      do erro (indica que o WC tem o SKU como variação/duplicado em outro
 *      produto), usa o resource_id sugerido e faz PUT como fallback.
 *
 * Todo fetch tem timeout de 15s e retorna erro legível em caso de falha.
 */

export interface WCCredentials {
  site_url: string;
  consumer_key: string;
  consumer_secret: string;
}

export interface WCProductPayload {
  name?: string;
  sku?: string;
  regular_price?: string;
  manage_stock?: boolean;
  stock_quantity?: number;
  stock_status?: "instock" | "outofstock";
}

export interface WCUpsertResult {
  ok: boolean;
  wc_product_id: number | null;
  wc_permalink: string | null;
  action: "create" | "update" | "lookup_update" | "conflict_update";
  error?: string;
  /** Tipo do produto no WC após o upsert (simple | variable | grouped | external). */
  type?: string;
  /** IDs das variações (apenas para produtos variable). */
  variations?: number[];
}

export interface WCVariacao {
  id: number;
  sku: string | null;
  regular_price: string | null;
  stock_quantity: number | null;
}

function baseUrl(site: string) {
  return site.replace(/\/+$/, "");
}

function authHeader(cred: WCCredentials) {
  const token = Buffer.from(`${cred.consumer_key}:${cred.consumer_secret}`).toString("base64");
  return `Basic ${token}`;
}

/** fetch com timeout de 15s e tipagem Accept application/json. */
async function wcFetch(url: string, init: RequestInit, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** Busca um produto pelo SKU. Retorna id, permalink ou null. */
export async function buscarProdutoPorSku(
  cred: WCCredentials,
  sku: string,
): Promise<{ id: number; permalink: string | null } | null> {
  const url = `${baseUrl(cred.site_url)}/wp-json/wc/v3/products?sku=${encodeURIComponent(sku)}&per_page=1`;
  const r = await wcFetch(url, {
    headers: { Authorization: authHeader(cred) },
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => []) as Array<{ id?: number; permalink?: string }>;
  if (!Array.isArray(data) || data.length === 0 || !data[0]?.id) return null;
  return { id: data[0].id, permalink: data[0].permalink ?? null };
}

interface WCProdutoResp {
  id?: number;
  permalink?: string;
  type?: string;
  variations?: number[];
}

/** Atualiza produto existente via PUT /products/{id}. */
async function atualizarProduto(
  cred: WCCredentials,
  id: number,
  payload: WCProductPayload,
): Promise<WCProdutoResp> {
  const url = `${baseUrl(cred.site_url)}/wp-json/wc/v3/products/${id}`;
  const r = await wcFetch(url, {
    method: "PUT",
    headers: {
      Authorization: authHeader(cred),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`PUT /products/${id} HTTP ${r.status}: ${txt.slice(0, 400)}`);
  }
  return r.json().catch(() => ({}));
}

/** Cria produto novo via POST /products. */
async function criarProduto(
  cred: WCCredentials,
  payload: WCProductPayload,
): Promise<WCProdutoResp> {
  const url = `${baseUrl(cred.site_url)}/wp-json/wc/v3/products`;
  const r = await wcFetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(cred),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    const err: Error & { wcStatus?: number; wcBody?: string } = new Error(
      `POST /products HTTP ${r.status}: ${txt.slice(0, 400)}`
    );
    err.wcStatus = r.status;
    err.wcBody = txt;
    throw err;
  }
  return r.json().catch(() => ({}));
}

/** Extrai resource_id do corpo de erro WC quando for product_invalid_sku. */
function parseResourceIdFromSkuError(body: string | undefined): number | null {
  if (!body) return null;
  try {
    const j = JSON.parse(body) as { code?: string; data?: { resource_id?: number } };
    if (j?.code === "product_invalid_sku" && typeof j.data?.resource_id === "number") {
      return j.data.resource_id;
    }
  } catch { /* not JSON */ }
  return null;
}

/**
 * Upsert resiliente no WooCommerce.
 *
 *   1. Se wc_product_id é conhecido → PUT direto.
 *   2. Senão, GET /products?sku=<sku>:
 *        a. Achou → PUT nesse id.
 *        b. Não achou → POST para criar.
 *   3. Se POST falhar com product_invalid_sku+resource_id → PUT nesse id.
 */
export async function upsertProduto(
  cred: WCCredentials,
  payload: WCProductPayload,
  wcProductIdConhecido: number | null,
): Promise<WCUpsertResult> {
  // 1. Já sabemos o id
  if (wcProductIdConhecido) {
    try {
      const data = await atualizarProduto(cred, wcProductIdConhecido, payload);
      return {
        ok: true,
        wc_product_id: data.id ?? wcProductIdConhecido,
        wc_permalink: data.permalink ?? null,
        action: "update",
        type: data.type,
        variations: data.variations,
      };
    } catch (err) {
      return {
        ok: false,
        wc_product_id: wcProductIdConhecido,
        wc_permalink: null,
        action: "update",
        error: err instanceof Error ? err.message : "Erro no PUT",
      };
    }
  }

  // 2. Tenta descobrir por SKU
  if (payload.sku) {
    try {
      const encontrado = await buscarProdutoPorSku(cred, payload.sku);
      if (encontrado) {
        const data = await atualizarProduto(cred, encontrado.id, payload);
        return {
          ok: true,
          wc_product_id: data.id ?? encontrado.id,
          wc_permalink: data.permalink ?? encontrado.permalink,
          action: "lookup_update",
          type: data.type,
          variations: data.variations,
        };
      }
    } catch { /* segue para POST */ }
  }

  // 3. Criar novo
  try {
    const data = await criarProduto(cred, payload);
    return {
      ok: true,
      wc_product_id: data.id ?? null,
      wc_permalink: data.permalink ?? null,
      action: "create",
      type: data.type,
      variations: data.variations,
    };
  } catch (err) {
    // 4. Fallback: product_invalid_sku → usar resource_id sugerido
    const errTyped = err as Error & { wcStatus?: number; wcBody?: string };
    const rid = parseResourceIdFromSkuError(errTyped.wcBody);
    if (rid) {
      try {
        const data = await atualizarProduto(cred, rid, payload);
        return {
          ok: true,
          wc_product_id: data.id ?? rid,
          wc_permalink: data.permalink ?? null,
          action: "conflict_update",
          type: data.type,
          variations: data.variations,
        };
      } catch (err2) {
        return {
          ok: false,
          wc_product_id: rid,
          wc_permalink: null,
          action: "conflict_update",
          error: err2 instanceof Error ? err2.message : "Erro no PUT após conflito",
        };
      }
    }
    return {
      ok: false,
      wc_product_id: null,
      wc_permalink: null,
      action: "create",
      error: errTyped.message,
    };
  }
}

/**
 * Lista variações de um produto variável no WC.
 * GET /products/{id}/variations?per_page=100 — paginado manualmente se > 100.
 */
export async function listarVariacoes(
  cred: WCCredentials,
  wcProductId: number,
): Promise<WCVariacao[]> {
  const resultado: WCVariacao[] = [];
  let page = 1;
  while (true) {
    const url = `${baseUrl(cred.site_url)}/wp-json/wc/v3/products/${wcProductId}/variations?per_page=100&page=${page}`;
    const r = await wcFetch(url, { headers: { Authorization: authHeader(cred) } });
    if (!r.ok) break;
    const batch = await r.json().catch(() => []) as Array<{
      id: number; sku?: string; regular_price?: string; stock_quantity?: number | null;
    }>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const v of batch) {
      resultado.push({
        id: v.id,
        sku: v.sku ?? null,
        regular_price: v.regular_price ?? null,
        stock_quantity: v.stock_quantity ?? null,
      });
    }
    if (batch.length < 100) break;
    page += 1;
    if (page > 10) break; // safety
  }
  return resultado;
}

export interface VariacaoPayload {
  regular_price?: string;
  stock_quantity?: number;
  stock_status?: "instock" | "outofstock";
  manage_stock?: boolean;
}

/**
 * Sincroniza todas as variações de um produto variable.
 *
 * REGRA DE PREÇO:
 *   1. Usa o preço do FILHO (cada variação tem seu próprio preço no ERP).
 *      Esse é o preço que o cliente vê no site.
 *   2. Se o filho não tem preço (ou não existe no ERP) → fallback para o
 *      preço do pai.
 *   3. Se nenhum dos dois → pula atualização.
 *
 *   Retorna também `precos_variacoes` → lista de preços efetivamente
 *   enviados, útil para atualizar o pai no ERP pra refletir o intervalo.
 *
 * REGRA DE SALDO:
 *   Sempre do filho (cada variação tem seu estoque físico único).
 *   Se o filho não existe no ERP → saldo 0 (outofstock).
 */
export async function sincronizarVariacoes(
  cred: WCCredentials,
  wcProductId: number,
  resolverPorSku: (sku: string) => { preco: number; saldo: number } | null,
  options: { sync_preco: boolean; sync_estoque: boolean; preco_pai?: number },
): Promise<{
  tentadas: number;
  ok: number;
  erros: Array<{ sku: string; msg: string }>;
  precos_variacoes: number[];
}> {
  const resultado = {
    tentadas: 0,
    ok: 0,
    erros: [] as Array<{ sku: string; msg: string }>,
    precos_variacoes: [] as number[],
  };
  const varsWC = await listarVariacoes(cred, wcProductId);
  const precoPaiFallback = Number(options.preco_pai ?? 0);

  for (const v of varsWC) {
    if (!v.sku) continue;
    const dado = resolverPorSku(v.sku);
    // ── Preço: filho manda, pai é só fallback quando filho não tem ────
    const precoFinal = (dado?.preco && dado.preco > 0)
      ? dado.preco
      : precoPaiFallback;
    // ── Saldo: sempre do filho ────────────────────────────────────────
    const saldoFinal = dado?.saldo ?? 0;

    const payload: VariacaoPayload = {};
    if (options.sync_preco && precoFinal > 0) {
      payload.regular_price = String(Math.round(precoFinal));
      resultado.precos_variacoes.push(Math.round(precoFinal));
    }
    if (options.sync_estoque) {
      payload.manage_stock   = true;
      payload.stock_quantity = Math.max(0, saldoFinal);
      payload.stock_status   = saldoFinal > 0 ? "instock" : "outofstock";
    }
    if (Object.keys(payload).length === 0) continue;

    resultado.tentadas += 1;
    const r = await atualizarVariacao(cred, wcProductId, v.id, payload);
    if (r.ok) resultado.ok += 1;
    else resultado.erros.push({ sku: v.sku, msg: r.error ?? "Erro" });
  }
  return resultado;
}

/**
 * Atualiza uma variação via PUT /products/{pai_id}/variations/{var_id}.
 */
export async function atualizarVariacao(
  cred: WCCredentials,
  wcProductId: number,
  variacaoId: number,
  payload: VariacaoPayload,
): Promise<{ ok: boolean; error?: string }> {
  const url = `${baseUrl(cred.site_url)}/wp-json/wc/v3/products/${wcProductId}/variations/${variacaoId}`;
  try {
    const r = await wcFetch(url, {
      method: "PUT",
      headers: {
        Authorization: authHeader(cred),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return { ok: false, error: `HTTP ${r.status}: ${txt.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro de rede" };
  }
}
