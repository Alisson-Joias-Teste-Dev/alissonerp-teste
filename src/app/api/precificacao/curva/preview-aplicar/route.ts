/**
 * POST /api/precificacao/curva/preview-aplicar
 *
 * Calcula o impacto de aplicar a curva (do body ou do DB) em todos os produtos
 * ativos com peso_precificado informado. NAO persiste nada.
 *
 * Retorna stats agregados (produtos_afetados, variacao media/min/max) e
 * amostra com 100 itens para preview.
 *
 * Permissao: isPrecificacaoAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";
import {
  getPricingFactors,
  calcularPrecoSync,
  normalizeConfigRow,
  normalizeCategoriaRow,
  type CurvaConfig,
  type CurvaCategoriaInput,
  type Arredondamento,
} from "@/lib/curva-precificacao";

interface RequestBody {
  config?: CurvaConfig;
  categorias?: CurvaCategoriaInput[];
}

interface PreviewItem {
  produto_id: number;
  sku: string | null;
  nome: string | null;
  peso: number;
  markup_atual: number | null;
  markup_novo: number;
  preco_atual: number | null;
  preco_novo: number;
  comissao_pct: number;
  max_desconto: number;
  variacao_pct: number | null;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isPrecificacaoAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody;

  try {
    // ── Carregar config e categorias (body ou DB) ──
    let config = body.config;
    let categorias = body.categorias;

    if (!config) {
      const [row] = await sql`
        SELECT start_mkp, start_commission, gold_cost_percentage,
               sucata_compra_min_pct, sucata_compra_max_pct, arredondamento
        FROM alissonerp.curva_config WHERE id = 1
      `;
      if (!row) return NextResponse.json({ error: "Config não inicializada" }, { status: 500 });
      config = normalizeConfigRow(row as unknown as Record<string, unknown>);
    } else {
      const arr: Arredondamento = ["dezena", "unidade", "centena"].includes(config.arredondamento)
        ? config.arredondamento
        : "dezena";
      config = { ...config, arredondamento: arr };
    }

    if (!categorias) {
      const rows = await sql`
        SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem
        FROM alissonerp.curva_categorias WHERE ativo = true ORDER BY ordem ASC
      `;
      categorias = (rows as unknown as Record<string, unknown>[]).map(normalizeCategoriaRow);
    }

    const [paramsRow] = (await sql`SELECT ouro FROM public.parametros LIMIT 1`) as unknown as Array<{ ouro: string }>;
    const cotacao = Number(paramsRow?.ouro ?? 0);
    if (!cotacao) {
      return NextResponse.json({ error: "Cotação do ouro não disponível" }, { status: 500 });
    }

    // ── Buscar produtos ativos com peso ──
    const produtos = (await sql`
      SELECT id_produto, sku, nome, peso_precificado, markup, preco_sync
      FROM public.produtos
      WHERE situacao = 'A'
        AND peso_precificado IS NOT NULL
        AND peso_precificado > 0
    `) as unknown as Array<{
      id_produto: string | number;
      sku: string | null;
      nome: string | null;
      peso_precificado: string;
      markup: string | null;
      preco_sync: string | null;
    }>;

    // ── Calcular preview ──
    const itens: PreviewItem[] = [];
    let somaVar = 0;
    let countComVar = 0;
    let varMin = Infinity;
    let varMax = -Infinity;
    let sobem = 0;
    let descem = 0;
    let semMudanca = 0;

    for (const p of produtos) {
      const peso = Number(p.peso_precificado);
      const factors = getPricingFactors(peso, config, categorias);
      const precoNovo = calcularPrecoSync(peso, cotacao, factors.mkp, config.arredondamento);
      const precoAtual = p.preco_sync != null ? Number(p.preco_sync) : null;
      const markupAtual = p.markup != null ? Number(p.markup) : null;

      let variacao: number | null = null;
      if (precoAtual != null && precoAtual > 0) {
        variacao = ((precoNovo - precoAtual) / precoAtual) * 100;
        somaVar += variacao;
        countComVar++;
        if (variacao < varMin) varMin = variacao;
        if (variacao > varMax) varMax = variacao;
        if (Math.abs(variacao) < 0.01) semMudanca++;
        else if (variacao > 0) sobem++;
        else descem++;
      } else {
        semMudanca++;
      }

      itens.push({
        produto_id: Number(p.id_produto),
        sku: p.sku,
        nome: p.nome,
        peso,
        markup_atual: markupAtual,
        markup_novo: Number(factors.mkp.toFixed(3)),
        preco_atual: precoAtual,
        preco_novo: precoNovo,
        comissao_pct: Number(factors.commission.toFixed(3)),
        max_desconto: factors.maxDiscount,
        variacao_pct: variacao != null ? Number(variacao.toFixed(2)) : null,
      });
    }

    const stats = {
      produtos_total: produtos.length,
      produtos_sobem: sobem,
      produtos_descem: descem,
      produtos_sem_mudanca: semMudanca,
      variacao_media_pct: countComVar > 0 ? Number((somaVar / countComVar).toFixed(2)) : 0,
      variacao_min_pct: varMin === Infinity ? 0 : Number(varMin.toFixed(2)),
      variacao_max_pct: varMax === -Infinity ? 0 : Number(varMax.toFixed(2)),
    };

    // Amostra: 100 com maior variacao absoluta
    const amostra = [...itens]
      .filter((i) => i.variacao_pct != null)
      .sort((a, b) => Math.abs((b.variacao_pct ?? 0)) - Math.abs((a.variacao_pct ?? 0)))
      .slice(0, 100);

    return NextResponse.json({ stats, amostra, cotacao });
  } catch (err) {
    console.error("[POST /api/precificacao/curva/preview-aplicar]", err);
    const msg = err instanceof Error ? err.message : "Erro ao calcular preview";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
