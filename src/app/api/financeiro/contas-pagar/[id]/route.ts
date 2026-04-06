import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── PATCH /api/financeiro/contas-pagar/[id] ──────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const contaId = Number(id);
  if (isNaN(contaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as {
    situacao?: string;
    valor?: number;
    data_vencimento?: string;
    data_pagamento?: string;
    obs?: string;
  };

  await sql`
    UPDATE alissonerp.contas_pagar SET
      situacao        = COALESCE(${body.situacao ?? null},        situacao),
      valor           = COALESCE(${body.valor ?? null},           valor),
      data_vencimento = COALESCE(${body.data_vencimento ?? null}::date, data_vencimento),
      data_pagamento  = COALESCE(${body.data_pagamento ?? null}::date,  data_pagamento),
      obs             = COALESCE(${body.obs ?? null},             obs),
      updated_at      = now()
    WHERE id = ${contaId}
  `;

  return NextResponse.json({ ok: true });
}
