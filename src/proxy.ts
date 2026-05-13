import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ─── Tiny OAuth2 keepalive (server-side, independente de admin logado) ──────────
// Renova o token proativamente a cada 30 min no primeiro request que passar.
let lastTinyKeepalive = 0;
const TINY_KEEPALIVE_MS = 30 * 60 * 1000;

async function maybeRefreshTinyToken() {
  const now = Date.now();
  if (now - lastTinyKeepalive < TINY_KEEPALIVE_MS) return;
  lastTinyKeepalive = now;
  try {
    const { ensureTinyToken } = await import("@/lib/vendas-aprovar");
    await ensureTinyToken();
  } catch { /* token refresh best-effort, não bloqueia requests */ }
}

// ─── Rate limiter in-memory ────────────────────────────────────────────────────
// 300 req/min não autenticado, 1000 req/min autenticado. Limpeza a cada 60s.
// Aumentado em 3x para acomodar polling de múltiplos componentes de pagamento.
const rateHits = new Map<string, { count: number; reset: number }>();

function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = rateHits.get(key);
  if (!entry || now > entry.reset) {
    rateHits.set(key, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateHits) {
      if (now > entry.reset) rateHits.delete(key);
    }
  }, 60_000);
}

// ─── Cache de sessão para getUser (reduz chamadas ao GoTrue) ──────────────────
const sessionCache = new Map<string, { user: Record<string, unknown> | null; exp: number }>();
const SESSION_CACHE_TTL_MS = 30_000; // 30s

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of sessionCache) {
      if (val.exp < now) sessionCache.delete(key);
    }
  }, 60_000);
}

// Mapa modulo → prefixo de rota (espelho de HREF_TO_MODULO em permissions.ts)
const MODULO_TO_PREFIX: Record<string, string> = {
  dashboard_fabrica: "/dashboard-fabrica",
  ordens:            "/ordens",
  pcp:               "/pcp",
  distribuicao:      "/distribuicao",
  estoque:           "/estoque",
  quebra:            "/quebra",
  insumos:           "/insumos",
  compras:           "/compras",
  protocolo:         "/protocolo",
  conferencia:       "/conferencia",
  entrega:           "/entrega",
  auditoria:         "/auditoria",
  vendas:              "/vendas",
  estoque_comercial:   "/estoque-comercial",
  financeiro:          "/financeiro",
  produtos:          "/produtos",
  precificacao:      "/precificacao",
  configuracoes:     "/configuracoes",
  tarefas:           "/tarefas",
  relatorios:        "/relatorios",
  purificacao:       "/purificacao",
  service:           "/service",
  service_painel:    "/service-painel",
  orcamento:         "/orcamento",
};

const PREFIXOS_PROTEGIDOS = new Set(Object.values(MODULO_TO_PREFIX));

// Cache de permissões por userId (TTL 15 min, max 500 entradas) — evita query ao banco a cada request
const rolePermCache = new Map<string, { modulos: string[]; exp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

// Limpeza periódica de entradas expiradas (a cada 10 min)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rolePermCache) {
      if (val.exp < now) rolePermCache.delete(key);
    }
  }, 10 * 60 * 1000);
}

async function getModulosForUser(userId: string, _origin: string, cookieHeader: string): Promise<string[] | null> {
  const cached = rolePermCache.get(userId);
  if (cached && cached.exp > Date.now()) return cached.modulos;

  // Usa 127.0.0.1 em vez do origin público para funcionar dentro do container Docker.
  // O origin público (ex: https://erp.alisson.api.br) não é roteável de dentro do container.
  const port = process.env.PORT ?? "3000";
  const internalBase = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${internalBase}/api/user/permissoes?user_id=${userId}`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) return null;
    const data = await res.json() as { modulos_leitura: string[] };
    const modulos = data.modulos_leitura ?? [];
    // Evitar crescimento ilimitado do cache
    if (rolePermCache.size >= CACHE_MAX_SIZE) {
      const oldest = rolePermCache.keys().next().value;
      if (oldest) rolePermCache.delete(oldest);
    }
    rolePermCache.set(userId, { modulos, exp: Date.now() + CACHE_TTL_MS });
    return modulos;
  } catch {
    return null;
  }
}

function canAccessModulos(modulos: string[], pathname: string): boolean {
  return modulos.some(m => {
    const prefix = MODULO_TO_PREFIX[m];
    return prefix && (pathname === prefix || pathname.startsWith(prefix + "/"));
  });
}

export async function proxy(request: NextRequest) {
  // Renovação proativa do token Tiny — primeiro request de cada janela de 30 min
  maybeRefreshTinyToken();

  const { pathname } = request.nextUrl;

  // 0. Whitelist — passa direto, sem auth nem role check
  if (
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/orcamento") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo") ||
    pathname.includes(".")
  ) {
    // Rate-limit para APIs de vendas/ordens/contatos — protege contra enumeração
    if (pathname.startsWith("/api/")) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        ?? request.headers.get("x-real-ip")
        ?? "unknown";
      const hasAuth = request.cookies.has("sb-access-token") || request.cookies.has("sb-refresh-token");
      if (!checkRateLimit(ip, hasAuth ? 1000 : 300)) {
        if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
          console.warn(`[429] IP=${ip} path=${pathname} authed=${hasAuth}`);
        }
        return NextResponse.json({
          error: "Muitas requisições. Tente novamente em instantes.",
          hint: "Limite de requisições excedido. Reduza a frequência ou aguarde.",
        }, {
          status: 429,
          headers: {
            "Retry-After": "60",
            "Cache-Control": "no-store",
          },
        });
      }

      // Se for GET em rota de consulta, adiciona Cache-Control para reduzir re-requests
      // max-age=2s no CDN/browser, stale-while-revalidate=4s permite servir cache obsoleto
      // enquanto revalida em background
      if (request.method === "GET") {
        const response = NextResponse.next();
        response.headers.set("Cache-Control", "private, max-age=2, stale-while-revalidate=4");
        return response;
      }
    }
    return NextResponse.next();
  }

  // Para rotas de página: inicializar Supabase e checar auth
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Usa cache de sessão para evitar chamar getUser() no GoTrue a cada request
  const sessionKey = request.headers.get("cookie") ?? "unknown";
  const cachedSession = sessionCache.get(sessionKey);

  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  if (cachedSession && cachedSession.exp > Date.now()) {
    userResult = { data: { user: cachedSession.user as never }, error: null };
  } else {
    userResult = await supabase.auth.getUser();
    if (userResult.data?.user) {
      sessionCache.set(sessionKey, { user: userResult.data.user as unknown as Record<string, unknown>, exp: Date.now() + SESSION_CACHE_TTL_MS });
      if (sessionCache.size > 1000) {
        const oldest = sessionCache.keys().next().value;
        if (oldest) sessionCache.delete(oldest);
      }
    }
  }

  const { user } = userResult.data;

  // 1. Não autenticado → redirecionar para login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Checar acesso apenas para rotas protegidas
  //    /service é controlado pelo DashboardShell (flag is_operador_service), não pelo módulo
  //    /service-painel é controlado server-side pela page.tsx (ROLES_SERVICE_PANEL), não pelo módulo
  const primeiroSegmento = "/" + pathname.split("/").filter(Boolean)[0];
  if (primeiroSegmento === "/service" || primeiroSegmento === "/service-painel") {
    // Proxy apenas garante que está autenticado (já feito acima)
    // A autorização de role é feita pela própria page.tsx
    return supabaseResponse;
  }
  if (PREFIXOS_PROTEGIDOS.has(primeiroSegmento)) {
    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") ?? "";

    // Buscar módulos do banco (com cache por userId, TTL 5 min)
    const modulos = await getModulosForUser(user.id, origin, cookieHeader);

    if (!modulos || !canAccessModulos(modulos, pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
