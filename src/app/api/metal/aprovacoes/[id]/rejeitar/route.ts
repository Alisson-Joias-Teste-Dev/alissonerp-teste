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
import { podeDecidir } from "@/lib/aprovacoes";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  // REGRA DE NEGÓCIO: mesma autoridade do "aprovar" — só quem estiver em
  // metal_aprovador_id decide (política config-first). Sem ctx.solicitanteId
  // (regra 3 do pacote 3a): metal não exclui quem cadastrou a compra.
  const decisao = await podeDecidir({ id: user.id, role: user.role }, "compra_metal");
  if (!decisao.pode) {
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
