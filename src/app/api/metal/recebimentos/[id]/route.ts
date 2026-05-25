// ═══════════════════════════════════════════════════════════════════════════
// TASK-015: GET /api/metal/recebimentos/[id]
//
// REGRA DE NEGÓCIO: Retorna detalhe completo de recebimento de metal
// com dados do cliente e saldo de crédito excedente.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { getRecebimentoPorId } from "@/lib/metal/recebimentos";

const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const receb = await getRecebimentoPorId(Number(id));
    if (!receb) {
      return NextResponse.json({ error: "Recebimento não encontrado" }, { status: 404 });
    }
    return NextResponse.json(receb);
  } catch (err) {
    return internalError("[GET /api/metal/recebimentos/[id]]", err);
  }
}
