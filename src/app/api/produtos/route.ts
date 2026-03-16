/**
 * GET /api/produtos
 *
 * Modos:
 *   (padrão)          — lista pais + simples (eh_variacao=false), se migration 063 aplicada
 *   ?parent_sku=SKU   — lista variações de um pai específico
 *   ?agrupar=false    — lista todos sem agrupamento
 *
 * Resiliente: se alissonerp.erp_produtos não existir (migration 063 pendente),
 * executa query original sem agrupamento e retorna erp fields como null.
 *
 * POST /api/produtos — cria produto novo (+ variações automáticas)
 * Body: {
 *   nome, sku?, tipo_metal?, cor_metal?,
 *   peso_precificado, markup, fator?,
 *   categoria_precificacao?,  tem_pedra_preciosa?,
 *   medidas?: { largura_aro?, altura_aro?, base? },
 *   composicao?: [{ insumo_id, tipo, quantidade, tamanho?, observacao? }],
 *   variacoes?: {
 *     eixos: string[],
 *     valores: { numeracao?: number[], cor_metal?: string[], comprimento?: number[] },
 *     regra_peso?: { tipo: 'incremental', base_numeracao: number, incremento_por_numero: number }
 *                | { tipo: 'tabela', valores: Record<string, number> }
 *   }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";

// ── Helpers para geração de variações ─────────────────────────────────────────

type ComboValues = { numeracao?: number; cor_metal?: string; comprimento?: number };

function gerarCombinacoes(
  eixos: string[],
  valores: Record<string, unknown[]>
): ComboValues[] {
  if (eixos.length === 0) return [{}];
  const [primeiro, ...resto] = eixos;
  const vPrimeiro = (valores[primeiro] ?? []) as (number | string)[];
  const combosResto = gerarCombinacoes(resto, valores);
  const resultado: ComboValues[] = [];
  for (const val of vPrimeiro) {
    for (const combo of combosResto) {
      resultado.push({ ...combo, [primeiro]: val } as ComboValues);
    }
  }
  return resultado;
}

const ORDER_WHITELIST = [
  "nome",
  "sku",
  "preco_sync",
  "diferenca_percentual",
  "preco_tiny",
  "peso_precificado",
  "id_produto",
];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const busca      = sp.get("busca")?.trim() ?? "";
  const tem_pedra  = sp.get("tem_pedra");
  const situacao   = sp.get("situacao") ?? "A";
  const parent_sku = sp.get("parent_sku")?.trim() ?? "";
  const agrupar    = sp.get("agrupar") !== "false";

  const page   = Math.max(1, Number(sp.get("page")  ?? 1));
  const limit  = Math.min(200, Math.max(1, Number(sp.get("limit") ?? 50)));
  const offset = (page - 1) * limit;

  const orderField = ORDER_WHITELIST.includes(sp.get("order") ?? "")
    ? (sp.get("order") as string)
    : "nome";
  const orderDir = sp.get("dir") === "desc" ? sql`DESC` : sql`ASC`;

  // ── WHERE fragments ────────────────────────────────────────────────────────

  const wBusca = busca
    ? sql`AND (p.nome ILIKE ${"%" + busca + "%"} OR p.sku ILIKE ${"%" + busca + "%"})`
    : sql``;

  const wPedra =
    tem_pedra === "true"  ? sql`AND p.tem_pedra_preciosa = true`  :
    tem_pedra === "false" ? sql`AND p.tem_pedra_preciosa = false` :
    sql``;

  const wSituacao = situacao ? sql`AND p.situacao = ${situacao}` : sql``;

  const orderFieldIdent =
    orderField === "nome"                 ? sql`p.nome`               :
    orderField === "sku"                  ? sql`p.sku`                :
    orderField === "preco_sync"           ? sql`p.preco_sync`         :
    orderField === "diferenca_percentual" ? sql`p.diferenca_percentual` :
    orderField === "preco_tiny"           ? sql`p.preco_tiny`         :
    orderField === "peso_precificado"     ? sql`p.peso_precificado`   :
    sql`p.id_produto`;

  try {
    // ── Verificar se migration 063 está aplicada ───────────────────────────
    const [tableRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
      ) AS exists
    `;
    const erpDisponivel = tableRow?.exists === true;

    // ── Query com erp_produtos (migration 063 aplicada) ────────────────────
    if (erpDisponivel) {
      const wAgrupamento = parent_sku
        ? sql`AND ep.parent_sku = ${parent_sku}`
        : agrupar
        ? sql`AND (ep.eh_variacao = false OR ep.id IS NULL)`
        : sql``;

      const orderVariacoes = parent_sku
        ? sql`NULLIF(regexp_replace(ep.sufixo_variacao, '[^0-9]', '', 'g'), '')::integer NULLS LAST, ep.sufixo_variacao ASC NULLS LAST`
        : sql`${orderFieldIdent} ${orderDir} NULLS LAST`;

      const [countRow] = await sql<{ total: string }[]>`
        SELECT COUNT(*) AS total
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        WHERE TRUE ${wBusca} ${wPedra} ${wSituacao} ${wAgrupamento}
      `;

      const total      = Number(countRow?.total ?? 0);
      const totalPages = Math.ceil(total / limit);

      const produtos = await sql`
        SELECT
          p.id_produto,
          p.nome,
          p.sku,
          NULL::text AS tipo_metal,
          p.peso_precificado,
          p.preco_tiny,
          p.preco_sync,
          p.preco_pedras,
          p.preco_total_sync,
          p.diferenca_percentual,
          p.tem_pedra_preciosa,
          p.situacao,
          NULL::text AS foto_produto,
          ep.id               AS erp_id,
          ep.eh_pai,
          ep.eh_variacao,
          ep.parent_sku,
          ep.sufixo_variacao,
          ep.numeracao,
          CASE WHEN ep.eh_pai = true THEN (
            SELECT count(*)::integer
            FROM alissonerp.erp_produtos filhos
            WHERE filhos.parent_id = ep.id
          ) ELSE 0 END AS qtd_variacoes
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        WHERE TRUE ${wBusca} ${wPedra} ${wSituacao} ${wAgrupamento}
        ORDER BY ${orderVariacoes}
        LIMIT  ${limit}
        OFFSET ${offset}
      `;

      return NextResponse.json({ produtos, total, page, limit, totalPages, erpDisponivel: true });
    }

    // ── Fallback sem erp_produtos (migration 063 pendente) ─────────────────
    const [countRow] = await sql<{ total: string }[]>`
      SELECT COUNT(*) AS total
      FROM public.produtos p
      WHERE TRUE ${wBusca} ${wPedra} ${wSituacao}
    `;

    const total      = Number(countRow?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    const produtos = await sql`
      SELECT
        p.id_produto,
        p.nome,
        p.sku,
        NULL::text    AS tipo_metal,
        p.peso_precificado,
        p.preco_tiny,
        p.preco_sync,
        p.preco_pedras,
        p.preco_total_sync,
        p.diferenca_percentual,
        p.tem_pedra_preciosa,
        p.situacao,
        NULL::text    AS foto_produto,
        NULL::integer AS erp_id,
        NULL::boolean AS eh_pai,
        NULL::boolean AS eh_variacao,
        NULL::text    AS parent_sku,
        NULL::text    AS sufixo_variacao,
        NULL::text    AS numeracao,
        0::integer    AS qtd_variacoes
      FROM public.produtos p
      WHERE TRUE ${wBusca} ${wPedra} ${wSituacao}
      ORDER BY ${orderFieldIdent} ${orderDir} NULLS LAST
      LIMIT  ${limit}
      OFFSET ${offset}
    `;

    return NextResponse.json({ produtos, total, page, limit, totalPages, erpDisponivel: false });
  } catch (err) {
    console.error("[GET /api/produtos]", err);
    return NextResponse.json({ error: "Erro ao buscar produtos" }, { status: 500 });
  }
}

// ── POST /api/produtos ─────────────────────────────────────────────────────────

interface ComposicaoItem {
  insumo_id: number;
  tipo: "metal" | "pedra" | "outro";
  quantidade: number;
  tamanho?: number | null;
  observacao?: string | null;
}

interface VariacoesConfig {
  eixos: string[];
  valores: Record<string, unknown[]>;
  regra_peso?: {
    tipo: "incremental";
    base_numeracao: number;
    incremento_por_numero: number;
  } | {
    tipo: "tabela";
    valores: Record<string, number>;
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    nome?: string;
    sku?: string;
    tipo_metal?: string;
    cor_metal?: string;
    peso_precificado?: number;
    markup?: number;
    fator?: number;
    categoria_precificacao?: string;
    tem_pedra_preciosa?: boolean;
    medidas?: { largura_aro?: number; altura_aro?: number; base?: number };
    composicao?: ComposicaoItem[];
    variacoes?: VariacoesConfig;
  };

  const { nome, tipo_metal, cor_metal, peso_precificado, markup, fator,
          categoria_precificacao, tem_pedra_preciosa, medidas, composicao, variacoes } = body;

  if (!nome?.trim()) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  if (!peso_precificado || peso_precificado <= 0) return NextResponse.json({ error: "peso_precificado inválido" }, { status: 400 });
  if (!markup || markup <= 0) return NextResponse.json({ error: "Categoria não encontrada para o peso informado" }, { status: 400 });

  try {
    // ── Determinar SKU ───────────────────────────────────────────────────────
    let sku = body.sku?.trim() ?? "";
    if (!sku) {
      const [skuRow] = await sql<{ next: string }[]>`
        SELECT (COALESCE(MAX(sku::integer), 1603) + 1)::text AS next
        FROM public.produtos WHERE sku ~ '^[0-9]+$'
      `;
      sku = skuRow?.next ?? "1604";
    }

    // ── Verificar SKU único ──────────────────────────────────────────────────
    const [dupSku] = await sql`SELECT 1 FROM public.produtos WHERE sku = ${sku} LIMIT 1`;
    if (dupSku) return NextResponse.json({ error: `SKU "${sku}" já existe` }, { status: 409 });

    // ── Calcular combinações de variações ────────────────────────────────────
    const combos = variacoes?.eixos?.length
      ? gerarCombinacoes(variacoes.eixos, variacoes.valores)
      : [];
    const temVariacoes = combos.length > 0;

    // ── Função auxiliar: calcular peso de uma variação ───────────────────────
    function pesoVariacao(combo: ComboValues): number {
      if (!variacoes?.regra_peso || combo.numeracao == null) return Number(peso_precificado);
      const rp = variacoes.regra_peso;
      if (rp.tipo === "incremental") {
        const diff = Number(combo.numeracao) - Number(rp.base_numeracao);
        return Number(peso_precificado) + diff * Number(rp.incremento_por_numero);
      }
      if (rp.tipo === "tabela") {
        return (rp.valores as Record<string, number>)[String(combo.numeracao)] ?? Number(peso_precificado);
      }
      return Number(peso_precificado);
    }

    // ── BOM do pai (preparar antes da transação) ─────────────────────────────
    const bomPai: ComposicaoItem[] = Array.isArray(composicao) ? composicao : [];
    const temPedra = bomPai.some((i) => i.tipo === "pedra");

    // ── Transação ────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sql as any).begin(async (tx: any) => {
      // Obter ID do pai
      const [seqPai] = await tx<{ id: string }[]>`SELECT nextval('alissonerp.seq_produto_id') AS id`;
      const paiId = Number(seqPai.id);

      // INSERT pai em public.produtos (trigger calcula preco_sync automaticamente)
      const [prodPai] = await tx<{ id_produto: number; sku: string; nome: string; preco_sync: string | null }[]>`
        INSERT INTO public.produtos
          (id_produto, sku, nome, tipo_metal, situacao,
           peso_precificado, markup, fator,
           categoria_precificacao, tem_pedra_preciosa)
        VALUES
          (${paiId}, ${sku}, ${nome.trim()}, ${tipo_metal ?? null}, 'A',
           ${Number(peso_precificado)}, ${Number(markup)}, ${Number(fator ?? 1)},
           ${categoria_precificacao ?? null}, ${tem_pedra_preciosa ?? false})
        RETURNING id_produto, sku, nome, preco_sync
      `;

      // INSERT pai em erp_produtos
      const [erpPai] = await tx<{ id: number; produto_id: number; sku: string }[]>`
        INSERT INTO alissonerp.erp_produtos
          (produto_id, sku, nome, eh_pai, eh_variacao,
           cor_metal, largura_aro, altura_aro, base)
        VALUES
          (${paiId}, ${sku}, ${nome.trim()}, ${temVariacoes}, false,
           ${cor_metal ?? null},
           ${medidas?.largura_aro ?? null},
           ${medidas?.altura_aro  ?? null},
           ${medidas?.base        ?? null})
        RETURNING id, produto_id, sku
      `;

      // INSERT BOM do pai
      for (const item of bomPai) {
        await tx`
          INSERT INTO alissonerp.produto_composicao
            (produto_id, insumo_id, tipo, quantidade, tamanho, observacao)
          VALUES
            (${paiId}, ${item.insumo_id}, ${item.tipo},
             ${Number(item.quantidade)},
             ${item.tamanho ?? null},
             ${item.observacao ?? null})
        `;
      }

      // ── Gerar variações ────────────────────────────────────────────────────
      const variacoesCriadas: Array<{ sku: string; nome: string; peso: number; produto_id: number }> = [];
      let contador = 1;

      for (const combo of combos) {
        const [seqVar] = await tx<{ id: string }[]>`SELECT nextval('alissonerp.seq_produto_id') AS id`;
        const varId = Number(seqVar.id);
        const skuVar = `${sku}-${contador}`;

        const pesoVar = Math.max(parseFloat(pesoVariacao(combo).toFixed(2)), 0.01);

        const sufixos: string[] = [];
        if (combo.numeracao != null) sufixos.push(`nº ${combo.numeracao}`);
        if (combo.cor_metal && combo.cor_metal !== cor_metal) sufixos.push(combo.cor_metal);
        if (combo.comprimento != null) sufixos.push(`${combo.comprimento}cm`);
        const nomeVar = sufixos.length > 0 ? `${nome.trim()} ${sufixos.join(" ")}` : `${nome.trim()} ${contador}`;

        // INSERT variação em public.produtos
        await tx`
          INSERT INTO public.produtos
            (id_produto, sku, nome, tipo_metal, situacao,
             peso_precificado, markup, fator,
             categoria_precificacao, tem_pedra_preciosa)
          VALUES
            (${varId}, ${skuVar}, ${nomeVar},
             ${combo.cor_metal ?? tipo_metal ?? null}, 'A',
             ${pesoVar}, ${Number(markup)}, ${Number(fator ?? 1)},
             ${categoria_precificacao ?? null}, ${tem_pedra_preciosa ?? false})
        `;

        // INSERT variação em erp_produtos
        await tx`
          INSERT INTO alissonerp.erp_produtos
            (produto_id, sku, nome,
             parent_sku, parent_id,
             eh_variacao, eh_pai,
             sufixo_variacao, numeracao, cor_metal, comprimento,
             largura_aro, altura_aro, base)
          VALUES
            (${varId}, ${skuVar}, ${nomeVar},
             ${sku}, ${erpPai.id},
             true, false,
             ${String(contador)},
             ${combo.numeracao != null ? String(combo.numeracao) : null},
             ${combo.cor_metal ?? cor_metal ?? null},
             ${combo.comprimento ?? null},
             ${medidas?.largura_aro ?? null},
             ${medidas?.altura_aro  ?? null},
             ${medidas?.base        ?? null})
        `;

        // Copiar BOM do pai (metal = quantidade ajustada pelo peso da variação)
        for (const item of bomPai) {
          const qty = item.tipo === "metal" ? pesoVar : Number(item.quantidade);
          await tx`
            INSERT INTO alissonerp.produto_composicao
              (produto_id, insumo_id, tipo, quantidade, tamanho, observacao)
            VALUES
              (${varId}, ${item.insumo_id}, ${item.tipo},
               ${qty}, ${item.tamanho ?? null}, ${item.observacao ?? null})
          `;
        }

        variacoesCriadas.push({ sku: skuVar, nome: nomeVar, peso: pesoVar, produto_id: varId });
        contador++;
      }

      return { pai: prodPai, erp: erpPai, variacoes: variacoesCriadas };
    });

    // ── Recalcular preço de pedras (fora da transação) ───────────────────────
    if (temPedra) {
      await recalcularPrecoPedras(result.pai.id_produto);
      for (const v of result.variacoes) {
        await recalcularPrecoPedras(v.produto_id);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        produto: result.pai,
        erp: result.erp,
        variacoes: result.variacoes,
        totalCriados: 1 + result.variacoes.length,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/produtos]", err);
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 });
  }
}
