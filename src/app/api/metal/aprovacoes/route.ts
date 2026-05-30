// ═══════════════════════════════════════════════════════════════════════════
// GET /api/metal/aprovacoes — Lista aprovações pendentes
//
// REGRA DE NEGÓCIO: Lista aprovações de compras de metal que excederam
// o teto. O aprovador configurado usa esta lista para aprovar ou rejeitar.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { listarAprovacoes } from "@/lib/metal/compras";

const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const result = await listarAprovacoes({
      status: searchParams.get("status") || undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    });
    return NextResponse.json(result);
  } catch (err) {
    return internalError("[GET /api/metal/aprovacoes]", err);
  }
}
