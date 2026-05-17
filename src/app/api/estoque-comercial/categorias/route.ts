import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/estoque-comercial/categorias — retorna categorias com estoque no local
// Aceita query param ?local_estoque_id=N
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const localEstoqueId = Number(url.searchParams.get("local_estoque_id")) || null;

  // Se não tiver local, retorna todas as categorias (sem filtro de estoque)
  if (!localEstoqueId) {
    const rows = await sql`
      SELECT DISTINCT p.categoria,
             COUNT(*) OVER (PARTITION BY p.categoria)::int AS total_produtos
      FROM public.produtos p
      WHERE p.categoria IS NOT NULL AND p.categoria != ''
      ORDER BY p.categoria
    `;
    return NextResponse.json(rows);
  }

  // Categorias com estoque no local — inclui subcategorias na contagem do pai
  const rows = await sql`
    WITH base AS (
      SELECT p.categoria,
             COUNT(*)::int AS total_produtos
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      JOIN public.produtos p ON p.id_produto = v.produto_id
      WHERE v.local_estoque_id = ${localEstoqueId}
        AND p.categoria IS NOT NULL AND p.categoria != ''
        AND v.saldo_fisico > 0
      GROUP BY p.categoria
    )
    SELECT
      categoria,
      total_produtos,
      -- indica se é categoria pai (tem subcategorias)
      EXISTS (
        SELECT 1 FROM base b2
        WHERE b2.categoria LIKE base.categoria || ' -> %'
      ) AS tem_subcategorias
    FROM base
    ORDER BY categoria
  `;

  return NextResponse.json(rows);
}
