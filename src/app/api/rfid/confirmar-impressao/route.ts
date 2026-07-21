import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { RfidConfirmarSchema } from "@/lib/rfid/tipos";
import { confirmarImpressao } from "@/lib/rfid/repo";
import { validateEpc } from "@/lib/rfid/epc";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

/**
 * POST /api/rfid/confirmar-impressao
 *
 * Body: { epc: string }
 *
 * Chamado pelo frontend apos o Zebra Browser Print retornar sucesso.
 * Muda status de 'pendente_impressao' para 'ativo'.
 *
 * Response:
 *   200 { ok: true }
 *   401 nao autenticado
 *   400 epc invalido / body invalido
 *   409 joia nao esta pendente (ja ativa, cancelada, ou inexistente)
 */
export async function POST(req: NextRequest) {
  // -----------------------------------------------------------
  // 1. Auth
  // -----------------------------------------------------------
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  // -----------------------------------------------------------
  // 2. Parse + valida body
  // -----------------------------------------------------------
  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = RfidConfirmarSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const epc = parsed.data.epc.trim();

  // Valida formato EPC (24 digitos, prefixo 1001 ou 0000)
  if (!validateEpc(epc)) {
    return NextResponse.json(
      { error: "EPC invalido — esperado 24 digitos numericos" },
      { status: 400 },
    );
  }

  try {
    // -----------------------------------------------------------
    // 3. Confirma impressao via repo
    // -----------------------------------------------------------
    const ok = await confirmarImpressao(epc);

    if (!ok) {
      return NextResponse.json(
        {
          error:
            "Joia nao esta pendente de impressao (ja foi confirmada, cancelada, ou EPC nao existe)",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/rfid/confirmar-impressao]", err, "Erro interno");
  }
}
