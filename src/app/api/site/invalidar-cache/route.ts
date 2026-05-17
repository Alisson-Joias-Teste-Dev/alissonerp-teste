/**
 * POST /api/site/invalidar-cache
 *
 * Limpa o cache em memória do schema-check. Útil logo após aplicar uma
 * migration sem reiniciar o servidor Next.js — força a próxima chamada
 * a re-verificar no information_schema.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import { invalidarSchemaCache } from "@/lib/schema-check";

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  invalidarSchemaCache();
  return NextResponse.json({ ok: true, cache_limpo: true });
}
