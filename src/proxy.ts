import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Espelho de ROLE_MENUS de permissions.ts — mantido em sync manualmente
const ROLE_ALLOWED: Record<string, string[]> = {
  desenvolvedor:      ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro", "/produtos", "/precificacao", "/configuracoes"],
  admin:              ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro", "/produtos", "/precificacao", "/configuracoes"],
  gerente_fabrica:    ["/dashboard-fabrica", "/ordens", "/pcp", "/distribuicao", "/estoque", "/quebra", "/protocolo", "/auditoria", "/compras", "/insumos", "/vendas", "/financeiro"],
  gerente_loja:       ["/ordens", "/estoque", "/protocolo", "/conferencia", "/entrega", "/auditoria", "/vendas", "/produtos", "/precificacao"],
  ourives:            ["/ordens", "/pcp"],
  motoboy:            ["/protocolo"],
  consultora:         ["/ordens", "/estoque", "/conferencia"],
  estoquista_fabrica: ["/estoque", "/quebra", "/compras", "/insumos"],
  estoquista_loja:    ["/estoque"],
  pcp:                ["/ordens", "/pcp", "/distribuicao", "/quebra"],
};

function canAccess(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  const allowed = ROLE_ALLOWED[role] ?? [];
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Conjunto de prefixos protegidos (derivado de ROLE_ALLOWED acima)
const ROTAS_PROTEGIDAS = new Set(Object.values(ROLE_ALLOWED).flat());

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Whitelist — passa direto, sem auth nem role check
  if (
    pathname === "/" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
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

  // 2. Checar role apenas para rotas protegidas
  const primeiroSegmento = "/" + pathname.split("/").filter(Boolean)[0];
  if (ROTAS_PROTEGIDAS.has(primeiroSegmento)) {
    const role = user.user_metadata?.role as string | undefined;
    if (!canAccess(role, pathname)) {
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
