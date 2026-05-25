// ═══════════════════════════════════════════════════════════════════════════
// TASK-008: GET /api/metal/cotacao
//
// REGRA DE NEGÓCIO: Retorna a cotação atual do ouro em R$/g.
// Fonte: public.parametros.ouro.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server";
import { internalError } from "@/lib/api-error";
import { getCotacaoOuro } from "@/lib/metal/config";

export async function GET() {
  try {
    const cotacao_ouro = await getCotacaoOuro();
    return NextResponse.json({ cotacao_ouro });
  } catch (err) {
    return internalError("[GET /api/metal/cotacao]", err);
  }
}
