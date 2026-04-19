import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/vendas/analise-frete?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now    = new Date();
  const inicio = searchParams.get("inicio") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const fim    = searchParams.get("fim")    ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Resumo de frete
  const [resumo] = await sql`
    SELECT
      COALESCE(SUM(total_frete), 0)              AS frete_total,
      COUNT(*) FILTER (WHERE total_frete > 0)    AS qtd_com_frete,
      COUNT(*)                                    AS qtd_total
    FROM alissonerp.vendas_erp
    WHERE data_venda >= ${inicio}::date
      AND data_venda <= ${fim}::date
      AND situacao NOT IN ('rascunho', 'cancelado')
  `;

  // Vendas com frete
  const vendasComFrete = await sql`
    SELECT
      v.id,
      v.numero_venda,
      v.data_venda,
      v.total_venda,
      v.total_frete,
      v.forma_frete,
      v.situacao,
      c.nome  AS cliente_nome,
      vd.nome AS vendedor_nome
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos   c  ON c.id_contato  = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
      AND v.total_frete > 0
    ORDER BY v.data_venda DESC
    LIMIT 200
  `;

  // Entregas pendentes (aprovado/enviado com data_entrega)
  const entregas = await sql`
    SELECT
      v.id,
      v.numero_venda,
      v.data_venda,
      v.data_entrega,
      v.total_venda,
      v.total_frete,
      v.situacao,
      c.nome  AS cliente_nome,
      vd.nome AS vendedor_nome
    FROM alissonerp.vendas_erp v
    LEFT JOIN public.contatos   c  ON c.id_contato  = v.cliente_id
    LEFT JOIN public.vendedores vd ON vd.id_vendedor = v.vendedor_id
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao IN ('aprovado', 'enviado', 'confirmado')
    ORDER BY v.data_entrega ASC NULLS LAST, v.data_venda DESC
    LIMIT 200
  `;

  return NextResponse.json({
    resumo: {
      frete_total:    Number(resumo.frete_total),
      qtd_com_frete:  Number(resumo.qtd_com_frete),
      qtd_total:      Number(resumo.qtd_total),
      pct_com_frete:  Number(resumo.qtd_total) > 0
                        ? Math.round((Number(resumo.qtd_com_frete) / Number(resumo.qtd_total)) * 100)
                        : 0,
    },
    vendas_com_frete: vendasComFrete.map((v) => ({
      id:            Number(v.id),
      numero_venda:  v.numero_venda as string,
      data_venda:    v.data_venda   as string,
      total_venda:   Number(v.total_venda),
      total_frete:   Number(v.total_frete),
      forma_frete:   v.forma_frete  as string | null,
      situacao:      v.situacao     as string,
      cliente_nome:  v.cliente_nome as string | null,
      vendedor_nome: v.vendedor_nome as string | null,
    })),
    entregas: entregas.map((v) => ({
      id:            Number(v.id),
      numero_venda:  v.numero_venda  as string,
      data_venda:    v.data_venda    as string,
      data_entrega:  v.data_entrega  as string | null,
      total_venda:   Number(v.total_venda),
      total_frete:   Number(v.total_frete),
      situacao:      v.situacao      as string,
      cliente_nome:  v.cliente_nome  as string | null,
      vendedor_nome: v.vendedor_nome as string | null,
    })),
  });
}
