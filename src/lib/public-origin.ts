import type { NextRequest } from "next/server";

/**
 * Retorna a URL pública (origin) do ERP respeitando reverse proxy.
 *
 * Ordem de prioridade:
 *   1. X-Forwarded-Proto + X-Forwarded-Host — setado por Easypanel/Traefik/
 *      nginx quando o request passa por reverse proxy. Esse é o header que
 *      carrega o domínio público real (ex: "erp.alissonjoias.com.br")
 *      enquanto req.nextUrl.origin pode ter o host interno do container.
 *   2. Host header simples (em setups mais diretos)
 *   3. req.nextUrl.origin (fallback, pode falhar atrás de proxy)
 *
 * Usado pelo OAuth2 do Tiny e outras integrações que precisam passar
 * redirect_uri exatamente igual entre auth e callback. Keycloak é
 * extremamente sensível a qualquer diferença na redirect_uri.
 */
export function getPublicOrigin(req: NextRequest): string {
  const fwdProto = req.headers.get("x-forwarded-proto");
  const fwdHost = req.headers.get("x-forwarded-host");

  if (fwdHost) {
    const proto = fwdProto ?? "https";
    // X-Forwarded-Host pode ter múltiplos valores separados por vírgula
    // (cadeia de proxies). Usa o primeiro, que é o mais externo.
    const host = fwdHost.split(",")[0].trim();
    return `${proto}://${host}`;
  }

  const host = req.headers.get("host");
  if (host) {
    const proto = fwdProto ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return req.nextUrl.origin;
}
