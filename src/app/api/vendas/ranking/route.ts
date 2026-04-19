import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/ranking?mes=&ano= ────────────────────────────────────────
// Ranking de vendedoras com metas tiers (Prata/Ouro/Diamante) + vendas hoje
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mes = Number(searchParams.get("mes") ?? new Date().getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? new Date().getFullYear());

  if (mes < 1 || mes > 12 || isNaN(mes) || isNaN(ano)) {
    return NextResponse.json({ error: "mes e ano inválidos" }, { status: 400 });
  }

  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim    = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const rows = await sql`
    SELECT
      vend.id_vendedor                                  AS vendedor_id,
      vend.nome                                         AS vendedor_nome,
      COUNT(v.id)::int                                  AS qtd_vendas,
      COALESCE(SUM(v.total_venda),    0)::numeric       AS total_venda,
      COALESCE(SUM(v.total_comissao), 0)::numeric       AS total_comissao,
      COALESCE((
        SELECT SUM(p.valor)
        FROM alissonerp.pagamentos_venda p
        WHERE p.venda_id = ANY(ARRAY_AGG(v.id))
          AND p.status = 'confirmado'
      ), 0)::numeric                                    AS total_pago,
      -- Vendas de hoje
      COALESCE(SUM(CASE WHEN v.data_venda = CURRENT_DATE THEN v.total_venda ELSE 0 END), 0)::numeric AS total_venda_hoje,
      COALESCE(SUM(CASE WHEN v.data_venda = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int                 AS qtd_vendas_hoje,
      -- Metas tiers
      m.meta_valor, m.meta_quantidade,
      m.meta_prata, m.meta_ouro, m.meta_diamante,
      m.horario_inicio::text, m.horas_por_dia, m.dias_nao_trabalhados
    FROM public.vendedores vend
    LEFT JOIN alissonerp.vendas_erp v
      ON  v.vendedor_id = vend.id_vendedor
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao   NOT IN ('rascunho','cancelado')
    LEFT JOIN alissonerp.metas_vendedoras m
      ON  m.vendedor_id = vend.id_vendedor
      AND m.mes = ${mes}
      AND m.ano = ${ano}
    WHERE (vend.situacao = 'Ativo' OR vend.situacao IS NULL)
    GROUP BY vend.id_vendedor, vend.nome,
             m.meta_valor, m.meta_quantidade,
             m.meta_prata, m.meta_ouro, m.meta_diamante,
             m.horario_inicio, m.horas_por_dia, m.dias_nao_trabalhados
    ORDER BY total_venda DESC
  `;

  return NextResponse.json(
    rows.map((r) => ({
      vendedor_id:          Number(r.vendedor_id),
      vendedor_nome:        r.vendedor_nome as string,
      qtd_vendas:           Number(r.qtd_vendas),
      total_venda:          Number(r.total_venda),
      total_pago:           Number(r.total_pago),
      total_comissao:       Number(r.total_comissao),
      total_venda_hoje:     Number(r.total_venda_hoje),
      qtd_vendas_hoje:      Number(r.qtd_vendas_hoje),
      meta_valor:           r.meta_valor != null ? Number(r.meta_valor) : null,
      meta_quantidade:      r.meta_quantidade != null ? Number(r.meta_quantidade) : null,
      meta_prata:           r.meta_prata != null ? Number(r.meta_prata) : null,
      meta_ouro:            r.meta_ouro != null ? Number(r.meta_ouro) : null,
      meta_diamante:        r.meta_diamante != null ? Number(r.meta_diamante) : null,
      horario_inicio:       r.horario_inicio ? String(r.horario_inicio).slice(0, 5) : "09:00",
      horas_por_dia:        Number(r.horas_por_dia ?? 8),
      dias_nao_trabalhados: r.dias_nao_trabalhados ?? [],
      pct_meta:             r.meta_prata != null && Number(r.meta_prata) > 0
                              ? Math.min(100, (Number(r.total_venda) / Number(r.meta_prata)) * 100)
                              : null,
    }))
  );
}
