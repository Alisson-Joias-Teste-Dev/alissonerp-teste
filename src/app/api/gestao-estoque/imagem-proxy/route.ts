/**
 * GET /api/gestao-estoque/imagem-proxy?url=<url-da-imagem>
 *
 * Proxy server-side pra buscar imagens de hosts externos (s3 do Tiny etc)
 * que nao permitem CORS direto no browser.
 *
 * Usado pelo gerador de catalogo PDF (PromotionModal) — o navegador faz fetch
 * para esse endpoint, e o servidor faz o fetch real (sem restricao CORS).
 *
 * Seguranca:
 *  - so aceita https:// (na URL inicial e em cada redirect)
 *  - whitelist de hosts (S3 do Tiny + servidor proprio) — match exato ou subdominio
 *  - timeout 10s
 *  - cache 1 dia (imagens de produto raramente mudam)
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Hosts permitidos pra evitar abuso do proxy
const HOSTS_PERMITIDOS = [
  's3.amazonaws.com',
  's3-us-west-2.amazonaws.com',
  'tiny-anexos-us.s3.amazonaws.com',
  '72.60.55.140',
];

function hostPermitido(url: URL): boolean {
  // Match EXATO ou subdominio real ('.'+h). O endsWith(h) cru foi removido:
  // 'evils3.amazonaws.com' terminava com 's3.amazonaws.com' e passava.
  return HOSTS_PERMITIDOS.some(h =>
    url.hostname === h || url.hostname.endsWith('.' + h)
  );
}

/**
 * Valida a URL contra as regras do proxy (https + host permitido).
 * Usada na URL inicial E em cada redirect — sem revalidar o destino do
 * redirect, um host permitido podia redirecionar para rede interna (SSRF).
 */
function urlPermitida(u: URL): boolean {
  return u.protocol === 'https:' && hostPermitido(u);
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  // Proxy externo (S3 Tiny). 60/min por user — catalogo PDF carrega varias imgs.
  try {
    rateLimit(`imagem-proxy:${user.id}`, 60, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  if (!targetUrl) {
    return NextResponse.json({ error: "url obrigatório" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return NextResponse.json({ error: "apenas https" }, { status: 400 });
  }
  if (!hostPermitido(parsed)) {
    return NextResponse.json({ error: `host não permitido: ${parsed.hostname}` }, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    // redirect manual: seguimos no maximo 3 saltos, revalidando CADA destino
    // contra a whitelist (fetch padrao seguia 3xx sem validar = furo SSRF).
    let atual = new URL(targetUrl);
    let upstream: Response | null = null;
    for (let salto = 0; salto < 3; salto++) {
      const r: Response = await fetch(atual.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'AlissonERP-ImageProxy/1.0' },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (!loc) { upstream = r; break; }
        const destino = new URL(loc, atual);
        if (!urlPermitida(destino)) {
          clearTimeout(timeout);
          return NextResponse.json({ error: `redirect não permitido: ${destino.hostname}` }, { status: 403 });
        }
        atual = destino;
        continue;
      }
      upstream = r;
      break;
    }
    clearTimeout(timeout);
    if (!upstream) {
      return NextResponse.json({ error: "redirects demais" }, { status: 502 });
    }

    if (!upstream.ok) {
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg';
    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    return internalError("[GET /api/gestao-estoque/imagem-proxy]", err);
  }
}
