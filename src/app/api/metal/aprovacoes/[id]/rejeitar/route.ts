// ═══════════════════════════════════════════════════════════════════════════
// POST /api/metal/aprovacoes/[id]/rejeitar — Rejeita compra acima do teto
//
// REGRA DE NEGÓCIO: O aprovador rejeita a compra.
// Compra passa de 'pendente_aprovacao' para 'cancelado'.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { rejeitarCompra } from "@/lib/metal/compras";

const ROLES_METAL = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    let motivo: string | undefined;
    try {
      const raw = await req.json().catch(() => ({}));
      motivo = raw.motivo || undefined;
    } catch {
      // motivo é opcional
    }
    await rejeitarCompra(Number(id), user.id, motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/metal/aprovacoes/[id]/rejeitar]", err, (err as Error).message, 400);
  }
}
