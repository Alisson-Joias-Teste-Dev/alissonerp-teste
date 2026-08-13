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

  // ── KPIs gerais ────────────────────────────────────────────────────────────
  const [kpis] = await sql`
    SELECT
      COALESCE(SUM(v.total_comissao),  0)::numeric AS comissao_total,
      COALESCE(SUM(v.total_desconto),  0)::numeric AS desconto_total,
      COALESCE(SUM(v.total_venda),     0)::numeric AS faturamento,
      COALESCE(SUM(v.total_produtos),  0)::numeric AS valor_bruto,
      CASE WHEN SUM(v.total_venda) > 0
        THEN ROUND(SUM(v.total_comissao) / SUM(v.total_venda) * 100, 2)
        ELSE 0 END::numeric                         AS pct_comissao_medio,
      CASE WHEN SUM(v.total_produtos) > 0
        THEN ROUND(SUM(v.total_desconto) / SUM(v.total_produtos) * 100, 2)
        ELSE 0 END::numeric                         AS pct_desconto_medio
    FROM alissonerp.vendas_erp v
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado', 'virou_credito')
  `;

  // ── Por vendedora (com total desejado = total_produtos antes do desconto) ─
  const porVendedora = await sql`
    SELECT
      vend.id_vendedor                            AS vendedor_id,
      vend.nome                                   AS vendedor_nome,
      COUNT(DISTINCT v.id)::int                   AS qtd_vendas,
      COALESCE(SUM(v.total_comissao),  0)::numeric AS comissao_total,
      COALESCE(SUM(v.total_desconto),  0)::numeric AS desconto_total,
      COALESCE(SUM(v.total_venda),     0)::numeric AS total_realizado,
      COALESCE(SUM(v.total_produtos),  0)::numeric AS total_desejado,
      CASE WHEN SUM(v.total_venda) > 0
        THEN ROUND(SUM(v.total_comissao) / SUM(v.total_venda) * 100, 2)
        ELSE 0 END::numeric                        AS pct_comissao_medio,
      CASE WHEN SUM(v.total_produtos) > 0
        THEN ROUND(SUM(v.total_desconto) / SUM(v.total_produtos) * 100, 2)
        ELSE 0 END::numeric                        AS pct_desconto_medio
    FROM public.vendedores vend
    INNER JOIN alissonerp.vendas_erp v
      ON  v.vendedor_id = vend.id_vendedor
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado', 'virou_credito')
    GROUP BY vend.id_vendedor, vend.nome
    ORDER BY comissao_total DESC
  `;

  // ── Calcular comissão perdida (diferença entre comissão "ideal" e real) ────
  // Comissão perdida = o que ganharia sem desconto - o que ganhou com desconto
  // Calculado por item: (preco_lista * quantidade * max_comissao_pct) - valor_comissao_real
  const comissaoPerdida = await sql`
    SELECT
      v.vendedor_id,
      COALESCE(SUM(
        CASE WHEN i.pct_desconto > 0
          THEN (i.preco_lista * i.quantidade * 0.04) - i.valor_comissao
          ELSE 0
        END
      ), 0)::numeric AS comissao_perdida
    FROM alissonerp.itens_venda_erp i
    JOIN alissonerp.vendas_erp v ON v.id = i.venda_id
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado', 'virou_credito')
    GROUP BY v.vendedor_id
  `;
  const perdidaMap = new Map(comissaoPerdida.map(r => [Number(r.vendedor_id), Number(r.comissao_perdida)]));

  // ── Itens detalhados (todos, não só com comissão > 0) ─────────────────────
  const itens = await sql`
    SELECT
      i.id AS item_id,
      i.nome_produto,
      i.sku,
      i.quantidade,
      i.preco_lista,
      i.preco_unitario,
      i.total_item,
      i.pct_desconto,
      i.pct_comissao,
      i.valor_comissao,
      v.id AS venda_id,
      v.numero_venda,
      v.data_venda::text AS data_venda,
      vend.nome AS vendedor_nome,
      v.vendedor_id
    FROM alissonerp.itens_venda_erp i
    JOIN alissonerp.vendas_erp v
      ON v.id = i.venda_id
      AND v.data_venda >= ${inicio}::date
      AND v.data_venda <= ${fim}::date
      AND v.situacao NOT IN ('rascunho', 'cancelado', 'virou_credito')
    JOIN public.vendedores vend ON vend.id_vendedor = v.vendedor_id
    ORDER BY v.data_venda DESC, v.id DESC, i.id
  `;

  // DEBUG: log raw vendedor_id type from first item
  if (itens.length > 0) {
    const raw = itens[0].vendedor_id;
    console.log("[analise-comissoes API] raw vendedor_id =", raw, "type =", typeof raw, "constructor =", raw?.constructor?.name);
  }

  // ── Totais rodapé ─────────────────────────────────────────────────────────
  const totalComissao = itens.reduce((s, i) => s + Number(i.valor_comissao), 0);
  const totalRetida   = porVendedora.reduce((s, r) => s + (perdidaMap.get(Number(r.vendedor_id)) ?? 0), 0);

  return NextResponse.json({
    kpis: {
      comissao_total:     Number(kpis.comissao_total),
      desconto_total:     Number(kpis.desconto_total),
      faturamento:        Number(kpis.faturamento),
      valor_bruto:        Number(kpis.valor_bruto),
      pct_comissao_medio: Number(kpis.pct_comissao_medio),
      pct_desconto_medio: Number(kpis.pct_desconto_medio),
      comissao_retida:    totalRetida,
    },
    por_vendedora: porVendedora.map((r) => ({
      vendedor_id:        Number(r.vendedor_id),
      vendedor_nome:      r.vendedor_nome as string,
      qtd_vendas:         Number(r.qtd_vendas),
      comissao_total:     Number(r.comissao_total),
      comissao_perdida:   perdidaMap.get(Number(r.vendedor_id)) ?? 0,
      desconto_total:     Number(r.desconto_total),
      total_realizado:    Number(r.total_realizado),
      total_desejado:     Number(r.total_desejado),
      pct_comissao_medio: Number(r.pct_comissao_medio),
      pct_desconto_medio: Number(r.pct_desconto_medio),
    })),
    itens: itens.map((i) => ({
      item_id:        Number(i.item_id),
      nome_produto:   i.nome_produto as string,
      sku:            i.sku as string | null,
      quantidade:     Number(i.quantidade),
      preco_lista:    Number(i.preco_lista),
      preco_unitario: Number(i.preco_unitario),
      total_item:     Number(i.total_item),
      pct_desconto:   Number(i.pct_desconto),
      pct_comissao:   Number(i.pct_comissao),
      valor_comissao: Number(i.valor_comissao),
      numero_venda:   i.numero_venda as string,
      data_venda:     i.data_venda as string,
      vendedor_nome:  i.vendedor_nome as string,
      vendedor_id:    Number(i.vendedor_id),
    })),
    totais: {
      comissao_total: totalComissao,
      comissao_retida: totalRetida,
    },
  });
}
