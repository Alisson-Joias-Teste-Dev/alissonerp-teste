// ═══════════════════════════════════════════════════════════════════════════
// TASK-012: POST /api/metal/compras/[id]/verificar
//
// REGRA DE NEGÓCIO: Verifica no Mercado Pago se o pagamento foi aprovado.
// Compara valor pago vs valor esperado. Se diferença, mantém pendente.
// Se aprovado e valor OK, confirma e metal entra no cofre_ouro via trigger.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { verificarPagamentoCompra } from "@/lib/metal/compras";

const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    rateLimit(`metal-compra-verificar:${user.id}`, 5, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const { id } = await params;
    const result = await verificarPagamentoCompra(Number(id));
    return NextResponse.json({ compra_id: Number(id), ...result });
  } catch (err) {
    return internalError("[POST /api/metal/compras/[id]/verificar]", err, (err as Error).message, 400);
  }
}
