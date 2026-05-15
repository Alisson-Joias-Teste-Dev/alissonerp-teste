import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  let body: { epc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const epc = typeof body?.epc === "string" ? body.epc.trim() : "";
  if (!epc || !/^AJ\d{2}\d{8}$/.test(epc)) {
    return NextResponse.json(
      { error: "epc invalido — esperado formato AJ{AA}{NNNNNNNN}" },
      { status: 400 },
    );
  }

  try {
    const updated = await sql`
      UPDATE alissonerp.joias_rfid
      SET status = 'ativo',
          updated_at = now()
      WHERE epc = ${epc}
        AND status = 'pendente_impressao'
      RETURNING id
    `;

    if (updated.length === 0) {
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
    console.error("[POST /api/rfid/confirmar-impressao] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
