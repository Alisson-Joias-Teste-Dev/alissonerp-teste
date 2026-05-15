import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/produtos/personalizados/proximo-sku
 *
 * Preview do proximo SKU que sera gerado (sem consumir a sequence).
 *
 * Usado pelo modal "+ Personalizado" para mostrar ao admin qual SKU
 * o produto vai receber antes de salvar.
 *
 * Regra da sequence:
 *   - is_called=false → ainda nao foi usada, proximo valor = last_value (default 1)
 *   - is_called=true  → ja foi usada, proximo valor = last_value + 1
 *
 * Response 200: { sku: "PZ0001" }
 */
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const [row] = await sql`
      SELECT
        'PZ' || LPAD(
          CASE
            WHEN is_called THEN (last_value + 1)::TEXT
            ELSE            last_value::TEXT
          END,
          4, '0'
        ) AS proximo_sku
      FROM alissonerp.seq_sku_pz
    `;

    return NextResponse.json({
      sku: (row?.proximo_sku as string | undefined) ?? "PZ0001",
    });
  } catch (err) {
    console.error("[GET /api/produtos/personalizados/proximo-sku]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
