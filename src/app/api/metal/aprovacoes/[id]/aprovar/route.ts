// ═══════════════════════════════════════════════════════════════════════════
// POST /api/metal/aprovacoes/[id]/aprovar — Aprova compra acima do teto
//
// REGRA DE NEGÓCIO: O aprovador configurado aprova a compra.
// Compra passa de 'pendente_aprovacao' para 'pendente_pagamento'
// e segue o fluxo normal de pagamento.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { internalError } from "@/lib/api-error";
import { aprovarCompra } from "@/lib/metal/compras";
import { ROLES_METAL_APROVACOES } from "@/lib/roles";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL_APROVACOES.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    await aprovarCompra(Number(id), user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/metal/aprovacoes/[id]/aprovar]", err, (err as Error).message, 400);
  }
}
