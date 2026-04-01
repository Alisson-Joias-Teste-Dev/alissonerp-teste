import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
};

const PREFIXOS_PROTEGIDOS = new Set(Object.values(MODULO_TO_PREFIX));

// Cache de permissões por userId (TTL 5 min) — evita query ao banco a cada request
const rolePermCache = new Map<string, { modulos: string[]; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Não autenticado → redirecionar para login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Checar acesso apenas para rotas protegidas
  const primeiroSegmento = "/" + pathname.split("/").filter(Boolean)[0];
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
