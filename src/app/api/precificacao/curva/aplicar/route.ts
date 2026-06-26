/**
 * POST /api/precificacao/curva/aplicar
 *
 * Aplica a curva salva no DB em todos os produtos ativos:
 *   UPDATE alissonerp.produtos_compat SET markup, comissao_pct, max_desconto_pct
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
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import {
  getPricingFactors,
  normalizeConfigRow,
  normalizeCategoriaRow,
} from "@/lib/curva-precificacao";
import { buildFiltrosProdutos } from "@/lib/produtos-filtros";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const FiltrosSchema = z.object({
  situacao: z.string().max(10).optional(),
  esconder_insumos: z.boolean().optional(),
  apenas_com_estoque: z.boolean().optional(),
  categoria: z.string().max(200).optional(),
  subcategoria: z.string().max(200).optional(),
  tipo_metal: z.string().max(100).optional(),
  tem_pedra: z.string().max(10).optional(),
  busca: z.string().max(200).optional(),
  sku_prefix: z.string().max(100).optional(),
  pendencia: z.string().max(50).optional(),
}).partial();

const ApplyBodySchema = z.object({
  filtros: FiltrosSchema.optional(),
}).partial();

interface ApplyBody {
  filtros?: z.infer<typeof FiltrosSchema>;
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
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

    // ── Montar filtros opcionais (body JSON) ──
    const raw = await req.json().catch(() => ({}));
    const parsedBody = ApplyBodySchema.safeParse(raw);
    if (!parsedBody.success) return zodError(parsedBody.error);
    const body = parsedBody.data as ApplyBody;
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
      SELECT p.id_produto, p.peso_precificado
      FROM alissonerp.produtos_compat p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.peso_precificado IS NOT NULL
        AND p.peso_precificado > 0
        ${w.wBusca} ${w.wSkuPrefix} ${w.wPedra} ${w.wSituacao}
        ${w.wCategoria} ${w.wTipoMetal} ${w.wEstoque}
        ${w.wEsconderInsumos} ${w.wPendencia}
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

    // ── 1. UPDATE markup em alissonerp.produtos_compat (trigger recalcula preco_sync) ──
    const resMarkup = await sql`
      UPDATE alissonerp.erp_produtos AS p SET markup = u.markup
      FROM (
        SELECT * FROM UNNEST(
          ${ids}::bigint[],
          ${markups}::numeric[]
        ) AS t(produto_id, markup)
      ) AS u
      WHERE p.produto_id = u.produto_id
    `;

    // ── 2. UPSERT comissao e max_desconto em alissonerp.produto_curva_aplicada ──
    await sql`
      INSERT INTO alissonerp.produto_curva_aplicada
        (produto_id, comissao_pct, max_desconto_pct, markup_aplicado, updated_at)
      SELECT t.produto_id, t.comissao_pct, t.max_desconto_pct, t.markup_aplicado, NOW()
      FROM UNNEST(
        ${ids}::bigint[],
        ${comissoes}::numeric[],
        ${maxDescontos}::numeric[],
        ${markups}::numeric[]
      ) AS t(produto_id, comissao_pct, max_desconto_pct, markup_aplicado)
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
    return internalError("[POST /api/precificacao/curva/aplicar]", err, "Erro ao aplicar curva");
  }
}
