/**
 * POST /api/precificacao/curva/aplicar
 *
 * Aplica a curva salva no DB em todos os produtos ativos:
 *   UPDATE public.produtos SET markup, comissao_pct, max_desconto_pct
 *
 * preco_sync e recalculado pelo trigger legado (trigger_atualizar_preco_produto)
 * quando markup muda. Nao sobrescrevemos preco_sync diretamente para respeitar
 * a zona no-touch.
 *
 * Estrategia: UPDATE em 1 query usando UNNEST com 4 arrays paralelos.
 *
 * Permissao: isFullAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import {
  getPricingFactors,
  normalizeConfigRow,
  normalizeCategoriaRow,
} from "@/lib/curva-precificacao";

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    // ── Carregar config e categorias ──
    const [configRow] = await sql`
      SELECT start_mkp, start_commission, gold_cost_percentage,
             sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
      FROM alissonerp.curva_config WHERE id = 1
    `;
    if (!configRow) {
      return NextResponse.json({ error: "Config não inicializada" }, { status: 500 });
    }
    const config = normalizeConfigRow(configRow as unknown as Record<string, unknown>);

    const catRows = await sql`
      SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
      FROM alissonerp.curva_categorias WHERE ativo = true ORDER BY ordem ASC
    `;
    const categorias = (catRows as unknown as Record<string, unknown>[]).map(normalizeCategoriaRow);

    if (categorias.length === 0) {
      return NextResponse.json({ error: "Nenhuma categoria ativa" }, { status: 400 });
    }

    // ── Buscar produtos ──
    const produtos = (await sql`
      SELECT id_produto, peso_precificado
      FROM public.produtos
      WHERE situacao = 'A'
        AND peso_precificado IS NOT NULL
        AND peso_precificado > 0
    `) as unknown as Array<{ id_produto: string | number; peso_precificado: string }>;

    if (produtos.length === 0) {
      return NextResponse.json({ ok: true, produtos_atualizados: 0, elapsed_s: "0.0" });
    }

    // ── Calcular markup, comissao, max_desconto por produto ──
    const ids: number[] = [];
    const markups: number[] = [];
    const comissoes: number[] = [];
    const maxDescontos: number[] = [];

    for (const p of produtos) {
      const peso = Number(p.peso_precificado);
      const factors = getPricingFactors(peso, config, categorias);
      ids.push(Number(p.id_produto));
      markups.push(Number(factors.mkp.toFixed(4)));
      comissoes.push(Number(factors.commission.toFixed(3)));
      maxDescontos.push(Number(factors.maxDiscount.toFixed(2)));
    }

    // ── 1. UPDATE markup em public.produtos (trigger recalcula preco_sync) ──
    const resMarkup = await sql`
      UPDATE public.produtos AS p SET markup = u.markup
      FROM (
        SELECT * FROM UNNEST(
          ${ids}::bigint[],
          ${markups}::numeric[]
        ) AS t(id_produto, markup)
      ) AS u
      WHERE p.id_produto = u.id_produto
    `;

    // ── 2. UPSERT comissao e max_desconto em alissonerp.produto_curva_aplicada ──
    await sql`
      INSERT INTO alissonerp.produto_curva_aplicada
        (produto_id, comissao_pct, max_desconto_pct, markup_aplicado, updated_at)
      SELECT * FROM UNNEST(
        ${ids}::bigint[],
        ${comissoes}::numeric[],
        ${maxDescontos}::numeric[],
        ${markups}::numeric[],
        ${ids.map(() => new Date())}::timestamptz[]
      ) AS t(produto_id, comissao_pct, max_desconto_pct, markup_aplicado, updated_at)
      ON CONFLICT (produto_id) DO UPDATE SET
        comissao_pct     = EXCLUDED.comissao_pct,
        max_desconto_pct = EXCLUDED.max_desconto_pct,
        markup_aplicado  = EXCLUDED.markup_aplicado,
        updated_at       = NOW()
    `;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({
      ok: true,
      produtos_atualizados: resMarkup.count ?? ids.length,
      elapsed_s: elapsed,
    });
  } catch (err) {
    console.error("[POST /api/precificacao/curva/aplicar]", err);
    const msg = err instanceof Error ? err.message : "Erro ao aplicar curva";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
