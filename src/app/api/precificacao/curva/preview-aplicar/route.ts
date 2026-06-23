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
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
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
import { buildFiltrosProdutos } from "@/lib/produtos-filtros";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const PreviewAplicarSchema = z.object({
  config: z.unknown().optional(),
  categorias: z.array(z.unknown()).optional(),
  filtros: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

interface RequestBody {
  config?: CurvaConfig;
  categorias?: CurvaCategoriaInput[];
  // Filtros opcionais da tela /produtos — restringe o alvo da aplicação.
  filtros?: {
    situacao?: string;
    esconder_insumos?: boolean;
    apenas_com_estoque?: boolean;
    categoria?: string;
    subcategoria?: string;
    tipo_metal?: string;
    tem_pedra?: string;
    busca?: string;
    sku_prefix?: string;
    pendencia?: string;
  };
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
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rawJson = await req.json().catch(() => ({}));
  const parsed = PreviewAplicarSchema.safeParse(rawJson);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data as unknown as RequestBody;

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

    // ── Montar filtros opcionais ──
    const sp = new URLSearchParams();
    const f = body.filtros ?? {};
    sp.set("situacao", f.situacao ?? "A");
    if (f.esconder_insumos)   sp.set("esconder_insumos", "true");
    if (f.apenas_com_estoque) sp.set("apenas_com_estoque", "true");
    if (f.categoria)    sp.set("categoria", f.categoria);
    if (f.subcategoria) sp.set("subcategoria", f.subcategoria);
    if (f.tipo_metal)   sp.set("tipo_metal", f.tipo_metal);
    if (f.tem_pedra)    sp.set("tem_pedra", f.tem_pedra);
    if (f.busca)        sp.set("busca", f.busca);
    if (f.sku_prefix)   sp.set("sku_prefix", f.sku_prefix);
    if (f.pendencia)    sp.set("pendencia", f.pendencia);
    const w = buildFiltrosProdutos(sp, { exclude: ["tipo_item"] });

    // ── Buscar produtos alvo (ativos com peso + filtros da tela) ──
    const produtos = (await sql`
      SELECT p.id_produto, p.sku, p.nome, p.peso_precificado, p.markup, p.preco_sync
      FROM alissonerp.produtos_compat p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.peso_precificado IS NOT NULL
        AND p.peso_precificado > 0
        ${w.wBusca} ${w.wSkuPrefix} ${w.wPedra} ${w.wSituacao}
        ${w.wCategoria} ${w.wTipoMetal} ${w.wEstoque}
        ${w.wEsconderInsumos} ${w.wPendencia}
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
      const precoNovo = calcularPrecoSync(peso, cotacao, factors.mkp, config.arredondamento, config.goldCostPercentage);
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
    return internalError("[POST /api/precificacao/curva/preview-aplicar]", err, "Erro ao calcular preview");
  }
}
