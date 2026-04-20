import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/rfid/sessao
 *
 * Retorna as ultimas 10 joias cadastradas pelo usuario logado (status='ativo').
 * Usado pelo painel lateral "Impressas nesta sessao" da tela de cadastro.
 *
 * Response: { joias: Array<{ epc, sku, nome, created_at }> }
 */
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const rows = await sql`
      SELECT
        epc,
        sku,
        nome,
        created_at
      FROM alissonerp.joias_rfid
      WHERE criado_por = ${user.id}::uuid
        AND status     = 'ativo'
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return NextResponse.json({ joias: rows });
  } catch (err) {
    console.error("[GET /api/rfid/sessao] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
