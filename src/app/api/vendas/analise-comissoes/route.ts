import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/vendas/analise-comissoes?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now    = new Date();
  const inicio = searchParams.get("inicio") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const fim    = searchParams.get("fim")    ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // KPIs gerais de comissão
  const [kpis] = await sql`
    SELECT
      COALESCE(SUM(v.total_comissao),  0) AS comissao_total,
      COALESCE(SUM(v.total_desconto),  0) AS desconto_total,
      COALESCE(SUM(v.total_venda),     0) AS faturamento,
      CASE WHEN SUM(v.total_venda) > 0
        THEN ROUND(SUM(v.total_comissao) / SUM(v.total_venda) * 100, 2)
        ELSE 0 END                         AS pct_comissao_medio,
      CASE WHEN SUM(v.total_produtos) > 0
        THEN ROUND(SUM(v.total_desconto) / SUM(v.total_produtos) * 100, 2)
        ELSE 0 END                         AS pct_desconto_medio
    FROM alissonerp.vendas_erp v
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
  `;

  // Por vendedora
  const porVendedora = await sql`
    SELECT
      vend.id_vendedor                            AS vendedor_id,
      vend.nome                                   AS vendedor_nome,
      COUNT(DISTINCT v.id)                        AS qtd_vendas,
      COALESCE(SUM(v.total_comissao),  0)         AS comissao_total,
      COALESCE(SUM(v.total_desconto),  0)         AS desconto_total,
      COALESCE(SUM(v.total_venda),     0)         AS total_venda,
      CASE WHEN SUM(v.total_venda) > 0
        THEN ROUND(SUM(v.total_comissao) / SUM(v.total_venda) * 100, 2)
        ELSE 0 END                                AS pct_comissao_medio,
      CASE WHEN SUM(v.total_produtos) > 0
        THEN ROUND(SUM(v.total_desconto) / SUM(v.total_produtos) * 100, 2)
        ELSE 0 END                                AS pct_desconto_medio
    FROM public.vendedores vend
    INNER JOIN alissonerp.vendas_erp v
      ON  v.vendedor_id = vend.id_vendedor
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
    GROUP BY vend.id_vendedor, vend.nome
    ORDER BY comissao_total DESC
  `;

  // Itens com maior comissão
  const itens = await sql`
    SELECT
      i.nome_produto,
      i.sku,
      i.quantidade,
      i.pct_desconto,
      i.pct_comissao,
      i.valor_comissao,
      i.total_item,
      v.numero_venda,
      v.data_venda,
      vend.nome AS vendedor_nome
    FROM alissonerp.itens_venda_erp i
    JOIN alissonerp.vendas_erp v
      ON v.id = i.venda_id
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
    JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id
    WHERE i.valor_comissao > 0
    ORDER BY i.valor_comissao DESC
    LIMIT 100
  `;

  return NextResponse.json({
    kpis: {
      comissao_total:     Number(kpis.comissao_total),
      desconto_total:     Number(kpis.desconto_total),
      faturamento:        Number(kpis.faturamento),
      pct_comissao_medio: Number(kpis.pct_comissao_medio),
      pct_desconto_medio: Number(kpis.pct_desconto_medio),
    },
    por_vendedora: porVendedora.map((r) => ({
      vendedor_id:        Number(r.vendedor_id),
      vendedor_nome:      r.vendedor_nome as string,
      qtd_vendas:         Number(r.qtd_vendas),
      comissao_total:     Number(r.comissao_total),
      desconto_total:     Number(r.desconto_total),
      total_venda:        Number(r.total_venda),
      pct_comissao_medio: Number(r.pct_comissao_medio),
      pct_desconto_medio: Number(r.pct_desconto_medio),
    })),
    itens: itens.map((i) => ({
      nome_produto:  i.nome_produto  as string,
      sku:           i.sku           as string | null,
      quantidade:    Number(i.quantidade),
      pct_desconto:  Number(i.pct_desconto),
      pct_comissao:  Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
      total_item:    Number(i.total_item),
      numero_venda:  i.numero_venda  as string,
      data_venda:    i.data_venda    as string,
      vendedor_nome: i.vendedor_nome as string,
    })),
  });
}
