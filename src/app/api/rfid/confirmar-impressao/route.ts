import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ConfirmarImpressaoSchema = z.object({
  epc: z.string().min(1, "obrigatório"),
}).passthrough();

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

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  const parsed = ConfirmarImpressaoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const epc = parsed.data.epc.trim();
  if (!/^AJ\d{2}\d{8}$/.test(epc)) {
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
