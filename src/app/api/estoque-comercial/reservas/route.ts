import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/estoque-comercial/reservas
// Lista reservas ativas (admin/debug)
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "ativo";
  const produtoId = url.searchParams.get("produto_id");

  const rows = await sql`
    SELECT
      r.id, r.produto_id, r.quantidade, r.status,
      r.local_estoque_id, le.nome AS local_nome,
      r.venda_id, r.item_venda_id,
      v.numero_venda,
      p.nome AS nome_produto, p.sku,
      r.efetivado_em, r.cancelado_em,
      r.created_at,
      uc.email AS criado_por_email
    FROM alissonerp.reservas_estoque_comercial r
    LEFT JOIN alissonerp.vendas_erp v ON v.id = r.venda_id
    LEFT JOIN public.produtos p ON p.id_produto = r.produto_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = r.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = r.created_by
    WHERE r.status = ${status}
      ${produtoId ? sql`AND r.produto_id = ${Number(produtoId)}` : sql``}
    ORDER BY r.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json(rows);
}
