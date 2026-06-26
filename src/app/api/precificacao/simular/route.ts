/**
 * POST /api/precificacao/simular
 *
 * Simula o impacto de uma mudança de markup em todos os produtos afetados.
 * NÃO aplica nenhuma alteração — apenas calcula e retorna previsão.
 *
 * Body: { tipo: 'ouro' | 'pedra', faixa_id: number, markup_novo: number }
 *
 * Fórmula ouro:  preco_novo = custo_na_cotacao × markup_novo  (arredondado)
 * Fórmula pedra: preco_novo = preco_compra_usd × cotacao_dolar × markup_novo × qtd (por BOM)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const SimularPostSchema = z.object({
  tipo: z.enum(["ouro", "pedra"]),
  faixa_id: z.coerce.number().int().positive(),
  markup_novo: z.union([z.coerce.number(), z.string()]),
}).passthrough();

function arredondarPorTipo(valor: number, tipo: string): number {
  if (tipo === "centena") return Math.round(valor / 100) * 100;
  if (tipo === "dezena") return Math.round(valor / 10) * 10;
  return Math.round(valor);
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SimularPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tipo, faixa_id, markup_novo: rawMarkupNovo } = parsed.data;
  // Normaliza vírgula → ponto para aceitar "2,5" e "2.5"
  const markup_novo = parseFloat(String(rawMarkupNovo ?? "").replace(",", "."));

  if (!markup_novo || markup_novo <= 0) {
    return NextResponse.json({ error: "markup_novo > 0 é obrigatório" }, { status: 400 });
  }

  // Buscar arredondamento configurado
  const [configArr] = await sql<{ valor: string }[]>`
    SELECT valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'preco_arredondamento'
    LIMIT 1
  `.catch(() => [{ valor: "dezena" }] as { valor: string }[]);
  const tipoArredondamento = configArr?.valor ?? "dezena";

  try {
    if (tipo === "ouro") {
      return await simularOuro(faixa_id, markup_novo, tipoArredondamento);
    } else {
      return await simularPedra(faixa_id, markup_novo, tipoArredondamento);
    }
  } catch (err) {
    console.error("[POST /api/precificacao/simular]", err);
    return NextResponse.json({ error: "Erro ao simular" }, { status: 500 });
  }
}

// ─── Simulação OURO ──────────────────────────────────────────────────────────
async function simularOuro(faixa_id: number, markup_novo: number, tipoArredondamento: string) {
  // Buscar a categoria (nome é o link com public.produtos.categoria_precificacao)
  const [categoria] = await sql`
    SELECT * FROM public."categoria_precificação" WHERE id = ${faixa_id}
  `;

  if (!categoria) {
    return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
  }

  // Coluna real da tabela legada: "categoryName"
  const faixaNome = (categoria.categoryName ?? categoria.nome ?? categoria.label ?? String(faixa_id)) as string;

  // Derivar pesoMin e pesoMax a partir do campo "range" (ex: "0.1g - 0.5g")
  // categoria_precificacao está vazia em todos os produtos — o link correto é pelo peso_precificado
  const rangeStr = (categoria.range ?? "") as string;
  const rangeMatch = rangeStr.match(/([\d.]+)g\s*-\s*([\d.]+)g/);
  const pesoMin = rangeMatch ? Number(rangeMatch[1]) : 0;
  const pesoMax = rangeMatch ? Number(rangeMatch[2]) : 999999;

  // Buscar produtos desta categoria por faixa de peso.
  // custo_na_cotacao é populado pelo trigger legado do Tiny ERP — pode ser NULL em produtos
  // criados pelo ERP. Quando NULL, calculamos inline: peso_precificado × cotacao_ouro × fator.
  const produtos = await sql<{
    id_produto: string;
    nome: string;
    sku: string | null;
    peso_precificado: string | null;
    fator: string | null;
    custo_na_cotacao: string | null;
    preco_sync: string | null;
    preco_na_cotacao: string | null;
    markup: string | null;
  }[]>`
    SELECT
      id_produto::text,
      nome,
      sku,
      peso_precificado,
      fator,
      custo_na_cotacao,
      preco_sync,
      preco_na_cotacao,
      markup
    FROM public.produtos
    WHERE COALESCE(peso_precificado, 0) >= ${pesoMin}
      AND COALESCE(peso_precificado, 0) <= ${pesoMax}
      AND situacao = 'A'
      AND COALESCE(peso_precificado, 0) > 0
    ORDER BY COALESCE(preco_sync, preco_na_cotacao) DESC NULLS LAST
  `;

  // Buscar cotação atual
  const [params] = await sql<{ ouro: string }[]>`
    SELECT ouro FROM public.parametros LIMIT 1
  `;
  const cotacaoOuro = Number(params?.ouro ?? 857.019);

  const simulacao = produtos.map((p) => {
    // custo_na_cotacao pode ser NULL (produtos criados pelo ERP sem sync do Tiny).
    // Fallback: peso_precificado × cotacao_ouro × fator (mesma fórmula do trigger legado).
    const custoBanco = Number(p.custo_na_cotacao ?? 0);
    const custoInline = Number(p.peso_precificado ?? 0) * cotacaoOuro * Number(p.fator ?? 1);
    const custo = custoBanco > 0 ? custoBanco : custoInline;
    const preco_atual = Number(p.preco_sync ?? p.preco_na_cotacao ?? 0);
    const preco_novo_raw = custo * markup_novo;
    const preco_novo = arredondarPorTipo(preco_novo_raw, tipoArredondamento);
    const variacao = preco_atual > 0
      ? Math.round(((preco_novo - preco_atual) / preco_atual) * 10000) / 100
      : 0;

    return {
      produto_id: Number(p.id_produto),
      nome: p.nome,
      sku: p.sku ?? "",
      peso: Number(p.peso_precificado ?? 0),
      preco_atual,
      preco_novo,
      variacao,
      markup: p.markup != null ? Number(p.markup) : null,
    };
  });

  const stats = calcStats(simulacao);

  return NextResponse.json({
    faixa_nome: faixaNome,
    markup_anterior: extrairMarkupCategoria(categoria),
    simulacao: simulacao.slice(0, 100), // top 100 para preview
    simulacao_total: simulacao,          // completo para CSV e aprovação
    stats,
    cotacao: cotacaoOuro,
  });
}

// ─── Simulação PEDRA ─────────────────────────────────────────────────────────
async function simularPedra(faixa_id: number, markup_novo: number, tipoArredondamento: string) {
  // Buscar faixa de pedra
  const [faixa] = await sql<{
    id: string;
    nome: string;
    tamanho_min: string;
    tamanho_max: string;
    markup: string;
  }[]>`
    SELECT id, nome, tamanho_min, tamanho_max, markup
    FROM alissonerp.markup_pedras
    WHERE id = ${faixa_id}
  `;

  if (!faixa) {
    return NextResponse.json({ error: "Faixa de pedra não encontrada" }, { status: 404 });
  }

  // Buscar cotação dólar
  const [params] = await sql<{ dollar: string }[]>`
    SELECT dollar FROM public.parametros LIMIT 1
  `;
  const cotDolar = Number(params?.dollar ?? 5.161);

  // Buscar produtos com BOM de pedras nesta faixa de tamanho
  const bomItens = await sql<{
    produto_id: string;
    quantidade: string;
    tamanho: string | null;
    preco_compra_usd: string;
  }[]>`
    SELECT pc.produto_id::text, pc.quantidade, pc.tamanho, pc.preco_compra_usd
    FROM alissonerp.produto_composicao pc
    WHERE pc.tipo = 'pedra'
      AND pc.preco_compra_usd IS NOT NULL
      AND pc.preco_compra_usd > 0
      AND COALESCE(pc.tamanho, 0) >= ${Number(faixa.tamanho_min)}
      AND COALESCE(pc.tamanho, 0) < ${Number(faixa.tamanho_max)}
  `;

  if (bomItens.length === 0) {
    return NextResponse.json({
      faixa_nome: faixa.nome,
      markup_anterior: Number(faixa.markup),
      simulacao: [],
      simulacao_total: [],
      stats: {
        produtos_afetados: 0,
        variacao_media: 0,
        variacao_min: 0,
        variacao_max: 0,
        produtos_sobem: 0,
        produtos_descem: 0,
        produtos_sem_mudanca: 0,
      },
      cotacao: cotDolar,
    });
  }

  // Agrupar por produto_id
  const porProduto = new Map<string, { custo_atual: number; custo_novo: number }>();
  for (const item of bomItens) {
    const custo_atual = Number(item.preco_compra_usd) * cotDolar * Number(faixa.markup) * Number(item.quantidade);
    const custo_novo = Number(item.preco_compra_usd) * cotDolar * markup_novo * Number(item.quantidade);
    const prev = porProduto.get(item.produto_id) ?? { custo_atual: 0, custo_novo: 0 };
    porProduto.set(item.produto_id, {
      custo_atual: prev.custo_atual + custo_atual,
      custo_novo: prev.custo_novo + custo_novo,
    });
  }

  const produtoIds = Array.from(porProduto.keys()).map(Number);

  // Buscar dados dos produtos
  const produtos = await sql<{
    id_produto: string;
    nome: string;
    sku: string | null;
    peso_precificado: string | null;
    preco_sync: string | null;
    preco_pedras: string | null;
    preco_total_sync: string | null;
    markup: string | null;
  }[]>`
    SELECT id_produto::text, nome, sku, peso_precificado, preco_sync, preco_pedras, preco_total_sync, markup
    FROM public.produtos
    WHERE id_produto = ANY(${produtoIds})
      AND situacao = 'A'
  `;

  const simulacao = produtos.map((p) => {
    const custos = porProduto.get(p.id_produto) ?? { custo_atual: 0, custo_novo: 0 };
    const preco_atual = Number(p.preco_total_sync ?? p.preco_sync ?? 0);
    const diff = custos.custo_novo - custos.custo_atual;
    const preco_novo_raw = preco_atual + diff;
    const preco_novo = arredondarPorTipo(preco_novo_raw, tipoArredondamento);
    const variacao = preco_atual > 0
      ? Math.round(((preco_novo - preco_atual) / preco_atual) * 10000) / 100
      : 0;

    return {
      produto_id: Number(p.id_produto),
      nome: p.nome,
      sku: p.sku ?? "",
      peso: Number(p.peso_precificado ?? 0),
      preco_atual,
      preco_novo,
      variacao,
      markup: p.markup != null ? Number(p.markup) : null,
    };
  });

  const stats = calcStats(simulacao);

  return NextResponse.json({
    faixa_nome: faixa.nome,
    markup_anterior: Number(faixa.markup),
    simulacao: simulacao.slice(0, 100),
    simulacao_total: simulacao,
    stats,
    cotacao: cotDolar,
  });
}

// ─── Helpers internos ─────────────────────────────────────────────────────────
function calcStats(simulacao: { variacao: number }[]) {
  if (simulacao.length === 0) {
    return { produtos_afetados: 0, variacao_media: 0, variacao_min: 0, variacao_max: 0, produtos_sobem: 0, produtos_descem: 0, produtos_sem_mudanca: 0 };
  }
  const variacoes = simulacao.map((s) => s.variacao);
  return {
    produtos_afetados: simulacao.length,
    variacao_media: Math.round((variacoes.reduce((a, b) => a + b, 0) / variacoes.length) * 100) / 100,
    variacao_min: Math.min(...variacoes),
    variacao_max: Math.max(...variacoes),
    produtos_sobem: simulacao.filter((s) => s.variacao > 0).length,
    produtos_descem: simulacao.filter((s) => s.variacao < 0).length,
    produtos_sem_mudanca: simulacao.filter((s) => s.variacao === 0).length,
  };
}

function extrairMarkupCategoria(cat: Record<string, unknown>): number {
  if (cat.markup != null && Number(cat.markup) > 0) return Number(cat.markup);
  if (cat.curvePoints) {
    const cp = cat.curvePoints;
    // curvePoints é array de strings JSON: ['{"markup":3.5,"weight":0.5,...}', ...]
    if (Array.isArray(cp) && cp.length > 0) {
      // Pegar o ponto do meio como referência de markup da faixa
      const midIdx = Math.floor(cp.length / 2);
      const item = cp[midIdx];
      const parsed = typeof item === "string" ? JSON.parse(item) : item;
      if (parsed?.markup != null) return Number(parsed.markup);
      // fallback: primeiro ponto
      const first = typeof cp[0] === "string" ? JSON.parse(cp[0] as string) : cp[0];
      if ((first as Record<string, unknown>)?.markup != null) return Number((first as Record<string, unknown>).markup);
    }
    if (typeof cp === "object" && cp !== null && "markup" in (cp as object)) {
      return Number((cp as Record<string, unknown>).markup);
    }
  }
  return 0;
}
