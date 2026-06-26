/**
 * In-memory rate limiter. Token-bucket fixo por chave.
 *
 * Limitacao: o estado vive na heap do processo. Multi-instance (varias replicas
 * Next, edge functions, lambdas) NAO compartilha o contador — atacante distribuido
 * fura. Para single-instance (dev server, container unico em prod) eh suficiente.
 *
 * Para multi-instance precisaria Redis ou DB compartilhado. TODO documentado no
 * CHANGELOG da onda 1H.
 */
import { NextResponse, type NextRequest } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Limpeza periodica de buckets expirados (evita vazamento de memoria).
// .unref() pra nao segurar event loop em testes/scripts curtos.
const cleanupTimer: NodeJS.Timeout | null = (() => {
  if (typeof setInterval !== "function") return null;
  const t = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
  if (typeof t.unref === "function") t.unref();
  return t;
})();
void cleanupTimer;

export class RateLimitError extends Error {
  status = 429;
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Muitas requisicoes, tente novamente em alguns instantes");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Aplica limite de `max` requisicoes por janela de `windowMs` ms para uma `key`.
 * Lanca `RateLimitError` (com retryAfter em segundos) se excedeu.
 *
 * Use chaves com prefixo unico por rota + identificador do cliente:
 *   rateLimit(`editor-ia:${user.id}`, 3, 60_000)
 *   rateLimit(`login:${ip}`, 5, 60_000)
 *
 * Para limites duplos (ex: 3/min E 30/hora), chame duas vezes seguidas com
 * keys diferentes — a primeira que estourar lanca.
 */
export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= max) {
    throw new RateLimitError(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  }
  bucket.count++;
}

/**
 * Converte um erro capturado em NextResponse 429 se for RateLimitError.
 * Devolve null se nao for — o handler deve re-lancar nesse caso.
 *
 * Uso tipico:
 *   try { rateLimit(`X:${user.id}`, 3, 60_000); }
 *   catch (e) {
 *     const r = rateLimitResponse(e);
 *     if (r) return r;
 *     throw e;
 *   }
 */
export function rateLimitResponse(e: unknown): NextResponse | null {
  if (e instanceof RateLimitError) {
    return NextResponse.json(
      { error: e.message },
      {
        status: 429,
        headers: { "Retry-After": String(e.retryAfter) },
      },
    );
  }
  return null;
}

/**
 * Extrai IP do cliente. Em produtos atras de proxy (Vercel, Cloudflare, nginx)
 * o IP real vem em x-forwarded-for ou x-real-ip — req.ip puro nao funciona.
 * Cai em "unknown" se nada estiver presente (modo dev/local).
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

// Exportado APENAS para testes — nao usar em codigo de producao.
export function _resetBucketsForTest(): void {
  buckets.clear();
}
