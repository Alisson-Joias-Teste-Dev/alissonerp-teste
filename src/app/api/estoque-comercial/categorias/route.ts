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

  // Categorias com estoque no local OU com config ativa (mesma lógica dos snapshots)
  const rows = await sql`
    WITH categorias_com_estoque AS (
      SELECT p.categoria,
             COUNT(*)::int AS total_produtos,
             COALESCE(SUM(v.saldo_fisico),0)::int AS total_estoque
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      JOIN public.produtos p ON p.id_produto = v.produto_id
      WHERE v.local_estoque_id = ${localEstoqueId}
        AND p.categoria IS NOT NULL AND p.categoria != ''
      GROUP BY p.categoria
    ),
    categorias_config AS (
      SELECT p.categoria,
             COUNT(*)::int AS total_produtos,
             0::int AS total_estoque
      FROM alissonerp.estoque_comercial_config cfg
      JOIN public.produtos p ON p.id_produto = cfg.produto_id
      WHERE cfg.ativo = true
        AND p.categoria IS NOT NULL AND p.categoria != ''
        AND NOT EXISTS (
          SELECT 1 FROM categorias_com_estoque c WHERE c.categoria = p.categoria
        )
      GROUP BY p.categoria
    )
    SELECT categoria, total_produtos, total_estoque
    FROM categorias_com_estoque
    UNION ALL
    SELECT categoria, total_produtos, total_estoque
    FROM categorias_config
    ORDER BY total_estoque DESC, categoria
  `;

  return NextResponse.json(rows);
}
