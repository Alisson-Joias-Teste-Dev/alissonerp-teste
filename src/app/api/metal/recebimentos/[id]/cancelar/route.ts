// ═══════════════════════════════════════════════════════════════════════════
// TASK-016: POST /api/metal/recebimentos/[id]/cancelar
//
// REGRA DE NEGÓCIO:
//   1. Reverte o crédito aplicado na venda
//   2. Cancela crédito excedente (creditos_cliente)
//   3. Marca recebimento como cancelado
//   4. NÃO remove do cofre_ouro (rastreio permanece como histórico)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { cancelarRecebimentoMetal } from "@/lib/metal/recebimentos";
import { ROLES_METAL } from "@/lib/roles";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await cancelarRecebimentoMetal(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/metal/recebimentos/[id]/cancelar]", err, (err as Error).message, 400);
  }
}
