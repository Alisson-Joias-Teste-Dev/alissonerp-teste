import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// ─── GET /api/vendas/ranking?mes=&ano= ────────────────────────────────────────
// Retorna ranking de vendedoras com realizado vs meta para o mês/ano
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

  // Vendas aprovadas/enviadas/concluídas no mês/ano (excluindo canceladas e rascunhos)
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim    = new Date(ano, mes, 0).toISOString().slice(0, 10); // último dia do mês

  const rows = await sql`
    SELECT
      vend.id_vendedor                              AS vendedor_id,
      vend.nome                                     AS vendedor_nome,
      COUNT(v.id)                                   AS qtd_vendas,
      COALESCE(SUM(v.total_venda),    0)            AS total_venda,
      COALESCE(SUM(v.total_comissao), 0)            AS total_comissao,
      COALESCE((
        SELECT SUM(p.valor)
        FROM alissonerp.pagamentos_venda p
        WHERE p.venda_id = ANY(ARRAY_AGG(v.id))
          AND p.status = 'confirmado'
      ), 0)                                         AS total_pago,
      m.meta_valor,
      m.meta_quantidade
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
    GROUP BY vend.id_vendedor, vend.nome, m.meta_valor, m.meta_quantidade
    ORDER BY total_venda DESC
  `;

  return NextResponse.json(
    rows.map((r) => ({
      vendedor_id:      Number(r.vendedor_id),
      vendedor_nome:    r.vendedor_nome as string,
      qtd_vendas:       Number(r.qtd_vendas),
      total_venda:      Number(r.total_venda),
      total_pago:       Number(r.total_pago),
      total_comissao:   Number(r.total_comissao),
      meta_valor:       r.meta_valor != null ? Number(r.meta_valor) : null,
      meta_quantidade:  r.meta_quantidade != null ? Number(r.meta_quantidade) : null,
      pct_meta:         r.meta_valor != null && Number(r.meta_valor) > 0
                          ? Math.min(100, (Number(r.total_venda) / Number(r.meta_valor)) * 100)
                          : null,
    }))
  );
}
