/**
 * POST /api/site/test
 *
 * Diagnóstico em cascata da conexão com WooCommerce/WordPress:
 *   1. Valida URL (protocolo, formato)
 *   2. Verifica se o host responde (/wp-json/)
 *   3. Verifica se a REST do WC está ativa (/wp-json/wc/v3)
 *   4. Autentica com Basic Auth contra /wp-json/wc/v3/system_status
 *      — se 401/403, tenta /wp-json/wc/v3/products?per_page=1 (mais permissivo)
 *
 * Retorna sempre:
 *   { ok, status, store_info?, error?, dica? }
 *
 * Se retornar `ok: true`, as credenciais podem sincronizar produtos.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const SiteTestSchema = z.object({
  site_url: z.string().optional(),
  consumer_key: z.string().optional(),
  consumer_secret: z.string().optional(),
}).passthrough();

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SiteTestSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;
  let site_url        = (body.site_url ?? "").trim();
  let consumer_key    = (body.consumer_key ?? "").trim();
  let consumer_secret = (body.consumer_secret ?? "").trim();

  // Fallback: pega do banco se faltar
  if (!site_url || !consumer_key || !consumer_secret) {
    const [row] = await sql<{
      site_url: string | null; consumer_key: string | null; consumer_secret: string | null;
    }[]>`SELECT site_url, consumer_key, consumer_secret FROM alissonerp.site_config WHERE id = 1`;
    site_url        = site_url        || (row?.site_url        ?? "");
    consumer_key    = consumer_key    || (row?.consumer_key    ?? "");
    consumer_secret = consumer_secret || (row?.consumer_secret ?? "");
  }

  // ── 1. Validação de URL ────────────────────────────────────────────────
  if (!site_url) {
    return NextResponse.json({
      ok: false,
      error: "URL do site não informada",
      dica: "Preencha o campo 'URL do site' com o domínio completo.",
    });
  }
  if (!/^https?:\/\//i.test(site_url)) {
    return NextResponse.json({
      ok: false,
      error: "URL sem protocolo",
      dica: "Inclua https:// no começo (ex: https://minhaloja.com.br).",
    });
  }
  if (!/^https:\/\//i.test(site_url)) {
    return NextResponse.json({
      ok: false,
      error: "WooCommerce REST API exige HTTPS para Basic Auth",
      dica: "Use https:// (não http://). Sem HTTPS seria necessário OAuth 1.0a.",
    });
  }
  if (!consumer_key || !consumer_secret) {
    return NextResponse.json({
      ok: false,
      error: "Consumer Key ou Consumer Secret vazio",
      dica: "Gere em WP-Admin → WooCommerce → Configurações → Avançado → REST API.",
    });
  }
  if (!consumer_key.startsWith("ck_")) {
    return NextResponse.json({
      ok: false,
      error: "Consumer Key deve começar com 'ck_'",
      dica: "Confira se não copiou algum caractere extra. Chaves WC começam com ck_.",
    });
  }
  if (!consumer_secret.startsWith("cs_")) {
    return NextResponse.json({
      ok: false,
      error: "Consumer Secret deve começar com 'cs_'",
      dica: "Confira se não copiou algum caractere extra. Secrets WC começam com cs_.",
    });
  }

  const base = site_url.replace(/\/+$/, "");
  const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString("base64");

  const fetchWithTimeout = (url: string, init: RequestInit = {}, ms = 10_000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
  };

  // ── 2. Verifica se /wp-json/ responde (host existe + REST ativa) ──────
  try {
    const r = await fetchWithTimeout(`${base}/wp-json/`, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      if (r.status === 404) {
        return NextResponse.json({
          ok: false,
          status: 404,
          error: "REST API do WordPress não encontrada (/wp-json retornou 404)",
          dica: "Ative permalinks bonitos em WP-Admin → Configurações → Links Permanentes (qualquer opção diferente de 'Simples').",
        });
      }
      return NextResponse.json({
        ok: false,
        status: r.status,
        error: `/wp-json retornou HTTP ${r.status}`,
        dica: "Um plugin de segurança (Wordfence, iTheme) pode estar bloqueando a REST API.",
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return NextResponse.json({
        ok: false,
        error: "Timeout ao contactar o site (>10s)",
        dica: "O host está acessível publicamente? Se for localhost/dev, use ngrok.",
      });
    }
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
      return NextResponse.json({
        ok: false,
        error: "Domínio não resolvido (DNS falhou)",
        dica: `O servidor ERP não consegue resolver ${base}. Verifique o domínio.`,
      });
    }
    if (msg.includes("ECONNREFUSED")) {
      return NextResponse.json({
        ok: false,
        error: "Conexão recusada",
        dica: "O host respondeu mas recusou. Verifique firewall/porta.",
      });
    }
    if (msg.includes("certificate") || msg.includes("SSL") || msg.includes("TLS")) {
      // Onda 1K: nao vaza err.message — apenas classifica. O msg do TLS pode
      // expor detalhes de cadeia/subject que viram fingerprint da infra.
      return NextResponse.json({
        ok: false,
        error: "Erro SSL/TLS no site de destino",
        dica: "O certificado HTTPS do site expirou ou é inválido.",
      });
    }
    console.error("[POST /api/site/test] fetch /wp-json/ falhou:", err);
    return NextResponse.json({
      ok: false,
      error: "Falha de rede ao alcancar o site",
      dica: "O servidor ERP não conseguiu alcançar o site.",
    });
  }

  // ── 3. Verifica se a REST do WooCommerce está ativa ────────────────────
  try {
    const r = await fetchWithTimeout(`${base}/wp-json/wc/v3`, { headers: { Accept: "application/json" } });
    if (r.status === 404) {
      return NextResponse.json({
        ok: false,
        status: 404,
        error: "Plugin WooCommerce não está ativo",
        dica: "Instale e ative o WooCommerce em WP-Admin → Plugins.",
      });
    }
  } catch {
    // Ignora — o teste 2 já validou que o host responde
  }

  // ── 4. Autenticação com Basic Auth — tenta 2 endpoints ────────────────
  async function tryEndpoint(path: string) {
    return fetchWithTimeout(`${base}${path}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
  }

  try {
    // Primeiro: system_status (precisa de read_access, mais informativo)
    let r = await tryEndpoint("/wp-json/wc/v3/system_status");

    if (r.status === 401 || r.status === 403) {
      // Fallback: products (permissivo — a maioria das chaves r/w tem)
      r = await tryEndpoint("/wp-json/wc/v3/products?per_page=1");
    }

    if (r.status === 401) {
      return NextResponse.json({
        ok: false,
        status: 401,
        error: "Credenciais inválidas (HTTP 401)",
        dica: "Regenere Consumer Key/Secret em WP-Admin → WooCommerce → Avançado → REST API.",
      });
    }
    if (r.status === 403) {
      return NextResponse.json({
        ok: false,
        status: 403,
        error: "Credenciais sem permissão (HTTP 403)",
        dica: "A chave precisa ter permissão 'Leitura/Escrita'. 'Somente Leitura' não cria produtos.",
      });
    }
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        status: r.status,
        error: `HTTP ${r.status}: ${txt.slice(0, 200) || "sem detalhe"}`,
        dica: r.status === 429
          ? "Rate limit atingido — aguarde alguns minutos."
          : "Veja detalhes no console do WP (wp-content/debug.log).",
      });
    }

    // Sucesso: monta info da loja a partir de system_status (se rolou)
    const data = await r.json().catch(() => ({}));
    let info = base;
    const typed = data as { environment?: { site_url?: string; version?: string; wc_version?: string } };
    if (typed.environment) {
      const env = typed.environment;
      info = `${env.site_url ?? base} · WC ${env.wc_version ?? "?"} · WP ${env.version ?? "?"}`;
    } else if (Array.isArray(data)) {
      info = `${base} · ${data.length} produto(s) acessível(is)`;
    }

    return NextResponse.json({ ok: true, status: 200, store_info: info });
  } catch (err) {
    // Onda 1K: nao vaza err.message do fetch ao cliente — antes podia expor
    // host interno, header de auth, etc. Log fica server-side.
    console.error("[POST /api/site/test] autenticacao WooCommerce falhou:", err);
    return NextResponse.json({
      ok: false,
      error: "Erro desconhecido na autenticação",
      dica: "Tente de novo. Se persistir, regenere as chaves.",
    });
  }
}
