/**
 * GET /api/gestao-estoque/produtos
 * Retorna todos os produtos ATIVOS (pais+simples+variações) em UMA query,
 * com agregações pré-calculadas:
 *  - saldo_estoque via JOIN com public.estoque (SKU)
 *  - data_ultima_venda via agregado em public.itens_venda + public.vendas
 *
 * SQL direto via postgres lib. Retorno integral usado pelo Dashboard analítico.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const rows = await sql`
      WITH ultima_venda AS (
        SELECT iv.produto_id, MAX(v.data_venda) AS data_ultima_venda
        FROM public.itens_venda iv
        JOIN public.vendas v ON v.id = iv.venda_id
        WHERE iv.produto_id IS NOT NULL
        GROUP BY iv.produto_id
      )
      SELECT
        p.id_produto,
        p.nome,
        p.sku,
        p.tipo_metal,
        p.peso_precificado,
        p.preco_tiny,
        p.preco_sync,
        p.preco_total_sync,
        p.preco_pedras,
        p.diferenca_percentual,
        p.tem_pedra_preciosa,
        p.situacao,
        p.categoria,
        p.categoria_precificacao,
        p.markup,
        p.fator,
        COALESCE(e.saldo, 0)::int AS saldo_estoque,
        COALESCE(e.saldo, 0)::int AS estoque,
        uv.data_ultima_venda,
        NULL::timestamptz        AS ultima_compra
      FROM public.produtos p
      LEFT JOIN public.estoque e      ON e.sku = p.sku
      LEFT JOIN ultima_venda uv       ON uv.produto_id = p.id_produto
      WHERE p.situacao = 'A'
    `;

    return NextResponse.json({ produtos: rows, total: rows.length });
  } catch (err) {
    console.error("[GET /api/gestao-estoque/produtos]", err);
    return NextResponse.json({ error: "Erro ao buscar produtos" }, { status: 500 });
  }
}
