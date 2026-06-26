// ═══════════════════════════════════════════════════════════════════════════
// TASK-011: POST /api/metal/compras/[id]/pagar
//
// REGRA DE NEGÓCIO: A EMPRESA gera pagamento no Mercado Pago para
// pagar o fornecedor. O ID do pagamento fica amarrado à compra.
// Só permite gerar se compra estiver pendente_pagamento.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { internalError } from "@/lib/api-error";
import { PagarCompraSchema } from "@/lib/metal/types";
import { gerarPagamentoCompra } from "@/lib/metal/compras";
import { ROLES_METAL } from "@/lib/roles";


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!ROLES_METAL.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    rateLimit(`metal-compra-pagar:${user.id}`, 5, 60_000);
  } catch (e) {
    const r = rateLimitResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = PagarCompraSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const result = await gerarPagamentoCompra(Number(id), parsed.data.metodo, user.id, {
      payer_email: parsed.data.payer_email,
      payer_nome: parsed.data.payer_nome,
    });

    return NextResponse.json({ compra_id: Number(id), ...result });
  } catch (err) {
    return internalError("[POST /api/metal/compras/[id]/pagar]", err, (err as Error).message, 400);
  }
}
