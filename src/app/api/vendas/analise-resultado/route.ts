import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/vendas/analise-resultado?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now   = new Date();
  const inicio = searchParams.get("inicio") ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const fim    = searchParams.get("fim")    ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Mês/ano do início para buscar metas
  const [anoMes] = await sql`SELECT EXTRACT(YEAR FROM ${inicio}::date) AS ano, EXTRACT(MONTH FROM ${inicio}::date) AS mes`;
  const mes = Number(anoMes.mes);
  const ano = Number(anoMes.ano);

  // KPIs gerais do período — vale-troca não conta para meta/faturamento
  const [kpis] = await sql`
    WITH vale_por_venda AS (
      SELECT venda_id, SUM(valor)::numeric AS vale_total
      FROM alissonerp.pagamentos_venda
      WHERE forma = 'Vale-Troca' AND status = 'confirmado'
      GROUP BY venda_id
    )
    SELECT
      COALESCE(SUM(v.total_venda - COALESCE(vpv.vale_total, 0)), 0)  AS faturamento,
      COALESCE(SUM(v.total_desconto), 0)                              AS total_desconto,
      COUNT(*)                                                         AS qtd_vendas,
      CASE WHEN COUNT(*) > 0
        THEN SUM(v.total_venda - COALESCE(vpv.vale_total, 0))::numeric / COUNT(*)
        ELSE 0 END                                                     AS ticket_medio
    FROM alissonerp.vendas_erp v
    LEFT JOIN vale_por_venda vpv ON vpv.venda_id = v.id
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
  `;

  // Ranking por vendedora — total_meta = total_venda - vale usado
  const ranking = await sql`
    WITH vale_por_venda AS (
      SELECT venda_id, SUM(valor)::numeric AS vale_total
      FROM alissonerp.pagamentos_venda
      WHERE forma = 'Vale-Troca' AND status = 'confirmado'
      GROUP BY venda_id
    )
    SELECT
      vend.id_vendedor                                                          AS vendedor_id,
      vend.nome                                                                 AS vendedor_nome,
      COUNT(DISTINCT v.id)                                                      AS qtd_vendas,
      COALESCE(SUM(v.total_venda), 0)                                          AS total_venda,
      COALESCE(SUM(v.total_venda - COALESCE(vpv.vale_total, 0)), 0)           AS total_meta,
      COALESCE(SUM(v.total_desconto), 0)                                       AS total_desconto,
      COALESCE(SUM(v.total_comissao), 0)                                       AS total_comissao,
      CASE WHEN COUNT(DISTINCT v.id) > 0
        THEN SUM(v.total_venda - COALESCE(vpv.vale_total, 0))::numeric / COUNT(DISTINCT v.id)
        ELSE 0 END                                                              AS ticket_medio,
      m.meta_valor,
      m.meta_quantidade
    FROM public.vendedores vend
    LEFT JOIN alissonerp.vendas_erp v
      ON  v.vendedor_id = vend.id_vendedor
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado')
    LEFT JOIN vale_por_venda vpv ON vpv.venda_id = v.id
    LEFT JOIN alissonerp.metas_vendedoras m
      ON  m.vendedor_id = vend.id_vendedor
      AND m.mes = ${mes}
      AND m.ano = ${ano}
    WHERE (vend.situacao = 'Ativo' OR vend.situacao IS NULL)
    GROUP BY vend.id_vendedor, vend.nome, m.meta_valor, m.meta_quantidade
    ORDER BY total_meta DESC
  `;

  // Meta geral do mês (soma de todas as metas)
  const [metaGeral] = await sql`
    SELECT COALESCE(SUM(meta_valor), 0) AS total_meta
    FROM alissonerp.metas_vendedoras
    WHERE mes = ${mes} AND ano = ${ano}
  `;

  return NextResponse.json({
    kpis: {
      faturamento:    Number(kpis.faturamento),
      total_desconto: Number(kpis.total_desconto),
      qtd_vendas:     Number(kpis.qtd_vendas),
      ticket_medio:   Number(kpis.ticket_medio),
    },
    meta_geral: Number(metaGeral.total_meta),
    ranking: ranking.map((r) => ({
      vendedor_id:     Number(r.vendedor_id),
      vendedor_nome:   r.vendedor_nome as string,
      qtd_vendas:      Number(r.qtd_vendas),
      total_venda:     Number(r.total_venda),
      total_meta:      Number(r.total_meta),
      total_desconto:  Number(r.total_desconto),
      total_comissao:  Number(r.total_comissao),
      ticket_medio:    Number(r.ticket_medio),
      meta_valor:      r.meta_valor != null ? Number(r.meta_valor) : null,
      meta_quantidade: r.meta_quantidade != null ? Number(r.meta_quantidade) : null,
      pct_meta:        r.meta_valor != null && Number(r.meta_valor) > 0
                         ? Math.round((Number(r.total_meta) / Number(r.meta_valor)) * 100)
                         : null,
    })),
  });
}
