import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

// ─── Cache em memória para getUser() ────────────────────────────────────────
// Reduz chamadas HTTP ao GoTrue server para requests consecutivas
// do mesmo usuário dentro da janela de 30s.
const userCache = new Map<string, { user: User; exp: number }>();
const USER_CACHE_TTL_MS = 30_000;

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of userCache) {
      if (val.exp < now) userCache.delete(key);
    }
  }, 60_000);
}

export async function createServerSupabase() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "alissonerp" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — ignore
          }
        },
      },
    }
  );

  // Wrap getUser com cache para evitar chamadas repetidas ao GoTrue
  const auth = supabase.auth;
  const origGetUser = auth.getUser.bind(auth);
  auth.getUser = async () => {
    const cookieStr = JSON.stringify(cookieStore.getAll());
    const cached = userCache.get(cookieStr);
    if (cached && cached.exp > Date.now()) {
      return { data: { user: cached.user }, error: null };
    }
    const result = await origGetUser();
    if (result.data?.user) {
      userCache.set(cookieStr, { user: result.data.user, exp: Date.now() + USER_CACHE_TTL_MS });
      if (userCache.size > 1000) {
        const firstKey = userCache.keys().next().value;
        if (firstKey) userCache.delete(firstKey);
      }
    }
    return result;
  };

  return supabase;
}
