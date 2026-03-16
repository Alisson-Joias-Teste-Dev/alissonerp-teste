import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, type Role } from "@/lib/auth/permissions";

// Rotas que requerem checagem de role (mapeadas em permissions.ts)
const ROTAS_PROTEGIDAS = new Set([
  "/dashboard-fabrica",
  "/ordens",
  "/pcp",
  "/distribuicao",
  "/estoque",
  "/quebra",
  "/insumos",
  "/compras",
  "/protocolo",
  "/conferencia",
  "/entrega",
  "/auditoria",
  "/vendas",
  "/financeiro",
  "/produtos",
  "/precificacao",
  "/configuracoes",
]);

export async function proxy(request: NextRequest) {
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

  const { pathname } = request.nextUrl;

  // 1. APIs — protegidas individualmente, nunca bloqueadas aqui
  if (pathname.startsWith("/api/")) {
    return supabaseResponse;
  }

  // 2. Login — redirecionar para / se já logado
  if (pathname.startsWith("/login")) {
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // 3. Não autenticado → redirecionar para login
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Checar role apenas para rotas protegidas
  const primeiroSegmento = "/" + pathname.split("/").filter(Boolean)[0];
  if (ROTAS_PROTEGIDAS.has(primeiroSegmento)) {
    const role = user.user_metadata?.role as Role | undefined;
    if (!canAccess(role, pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}
