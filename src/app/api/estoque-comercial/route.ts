import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/estoque-comercial
// Lista todos os produtos com estoque comercial ativo + alertas
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await sql`
    SELECT
      produto_id,
      nome_produto,
      sku,
      categoria,
      saldo,
      estoque_minimo,
      ativo,
      config_id,
      total_movimentacoes,
      alerta
    FROM alissonerp.vw_estoque_comercial_com_alerta
    ORDER BY
      CASE alerta
        WHEN 'zerado'         THEN 0
        WHEN 'abaixo_minimo'  THEN 1
        WHEN 'no_minimo'      THEN 2
        ELSE                       3
      END,
      nome_produto
  `;
  return NextResponse.json(rows.map(r => ({
    ...r,
    saldo: Number(r.saldo ?? 0),
    estoque_minimo: Number(r.estoque_minimo ?? 0),
    total_movimentacoes: Number(r.total_movimentacoes ?? 0),
  })));
}
