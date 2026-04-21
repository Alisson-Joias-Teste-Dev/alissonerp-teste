/**
 * POST /api/site/invalidar-cache
 *
 * Limpa o cache em memória do schema-check. Útil logo após aplicar uma
 * migration sem reiniciar o servidor Next.js — força a próxima chamada
 * a re-verificar no information_schema.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import { invalidarSchemaCache } from "@/lib/schema-check";

export async function POST() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  invalidarSchemaCache();
  return NextResponse.json({ ok: true, cache_limpo: true });
}
