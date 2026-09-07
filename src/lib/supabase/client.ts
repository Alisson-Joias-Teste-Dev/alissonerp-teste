import { createBrowserClient } from "@supabase/ssr";
import { DOMINIO_COOKIE } from "./cookie-dominio";

/**
 * 🔴 ESTE e o cliente que grava o cookie no LOGIN — nao o do servidor.
 *
 * Sem o `cookieOptions.domain` aqui, o cookie nasce preso ao host
 * (`homolog.alissonjoias.com.br`) e a tela do V2, que roda em
 * `homolog-v2.alissonjoias.com.br`, nao o enxerga — mesmo com o servidor
 * gravando certo, porque o do login vem depois e vence.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "alissonerp" },
      ...(DOMINIO_COOKIE ? { cookieOptions: { domain: DOMINIO_COOKIE } } : {}),
    }
  );
}
