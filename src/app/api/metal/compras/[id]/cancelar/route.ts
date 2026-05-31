// ═══════════════════════════════════════════════════════════════════════════
// TASK-013: POST /api/metal/compras/[id]/cancelar
//
// REGRA DE NEGÓCIO: Só cancela compra pendente_pagamento.
// Se já confirmada (metal no cofre), não permite cancelar.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { cancelarCompraMetal } from "@/lib/metal/compras";

/**
 * REGRA DE NEGÓCIO: consultora com acesso completo ao módulo metal pode cancelar
 * compras pendentes dentro do próprio fluxo.
 * IMPACTO SE REMOVIDO: operação de ajuste fica bloqueada por 403.
 */
const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await cancelarCompraMetal(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/metal/compras/[id]/cancelar]", err, (err as Error).message, 400);
  }
}
