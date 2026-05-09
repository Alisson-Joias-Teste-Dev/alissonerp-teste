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
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { aplicarCurvaProduto } from "@/lib/aplicar-curva-produto";
import { colunaExiste, tabelaExiste } from "@/lib/schema-check";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { dispararWebhookBackground } from "@/lib/webhooks-server";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";

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
  "tipo_metal",
  "situacao",
  "qtd_estoque",
];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role ?? "")) {
    const [perm] = await sql`
      SELECT pode_ler FROM alissonerp.role_permissoes
      WHERE role = ${role ?? ""} AND modulo = 'produtos'
    `;
    if (!perm?.pode_ler) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const busca       = sp.get("busca")?.trim() ?? "";
  const tem_pedra   = sp.get("tem_pedra");
  const tipo_metal  = sp.get("tipo_metal")?.trim() ?? "";
  const situacao    = sp.get("situacao") ?? "A";
  const parent_sku  = sp.get("parent_sku")?.trim() ?? "";
  const agrupar     = sp.get("agrupar") !== "false";
  const categoria    = sp.get("categoria")?.trim() ?? "";
  const subcategoria = sp.get("subcategoria")?.trim() ?? "";
  const apenasComEstoque = sp.get("apenas_com_estoque") === "true";

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

  const skuPrefix = sp.get("sku_prefix")?.trim() ?? "";
  const wSkuPrefix = skuPrefix
    ? sql`AND p.sku ILIKE ${skuPrefix + "%"}`
    : sql``;

  // Tipo de item (joia/insumo) — vem de alissonerp.produto_tipo_item
  const tipoItem = sp.get("tipo_item")?.trim() ?? "";
  const wTipoItem =
    tipoItem === "joia"     ? sql`AND ti.tipo_item = 'joia'` :
    tipoItem === "insumo"   ? sql`AND ti.tipo_item = 'insumo'` :
    tipoItem === "__sem__"  ? sql`AND ti.tipo_item IS NULL` :
    sql``;

  // Pendências — produtos com dados incompletos.
  const esconderInsumos = sp.get("esconder_insumos") === "true";
  // Esconder insumos também cobre mostruário e matérias-primas
  const wEsconderInsumos = esconderInsumos
    ? sql`AND (p.sku IS NULL OR p.sku NOT ILIKE 'IS%')
          AND (p.sku IS NULL OR p.sku NOT ILIKE 'MO%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Insumos%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Matérias Primas%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruário%')
          AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruario%')`
    : sql``;

  const pendencia = sp.get("pendencia")?.trim() ?? "";
  // Produtos com personalizacao ativa (PZxxxx sob encomenda) — peso/preco sao
  // calculados por letra. Nao contam como pendencia de peso/preco.
  const wNaoPersonalizado = sql`NOT EXISTS (
    SELECT 1 FROM alissonerp.produto_personalizacao pp
    WHERE pp.produto_id = p.id_produto
      AND pp.ativo = true
  )`;
  const wSemCat   = sql`(p.categoria IS NULL OR TRIM(p.categoria) = '')`;
  const wSemMetal = sql`(p.tipo_metal IS NULL OR TRIM(p.tipo_metal) = '')`;
  const wSemPeso  = sql`(p.peso_precificado IS NULL OR p.peso_precificado = 0)
                    AND ${wNaoPersonalizado}`;
  // "Sem preço" = TODOS os preços são nulos ou zero (comparação numérica).
  // Antes comparava ::text = '0' e falhava para "0.00" gravado como string.
  const wSemPreco = sql`COALESCE(p.preco_sync::numeric,       0) = 0
                    AND COALESCE(p.preco_total_sync::numeric, 0) = 0
                    AND COALESCE(p.preco_tiny::numeric,       0) = 0
                    AND ${wNaoPersonalizado}`;
  const wPendencia =
    pendencia === "sem_categoria" ? sql`AND ${wSemCat}` :
    pendencia === "sem_metal"     ? sql`AND ${wSemMetal}` :
    pendencia === "sem_peso"      ? sql`AND ${wSemPeso}` :
    pendencia === "sem_preco"     ? sql`AND ${wSemPreco}` :
    pendencia === "qualquer"      ? sql`AND (${wSemCat} OR ${wSemMetal} OR ${wSemPeso} OR ${wSemPreco})` :
    sql``;

  const wPedra =
    tem_pedra === "true"  ? sql`AND p.tem_pedra_preciosa = true`  :
    tem_pedra === "false" ? sql`AND p.tem_pedra_preciosa = false` :
    sql``;

  // Filtro com/sem variacoes (usa erp_produtos.eh_pai; a query ja faz LEFT JOIN ep)
  const comVariacoes = sp.get("com_variacoes")?.trim() ?? "";
  const wVariacoes =
    comVariacoes === "true"  ? sql`AND ep.eh_pai = true` :
    comVariacoes === "false" ? sql`AND (ep.eh_pai IS NULL OR ep.eh_pai = false)` :
    sql``;

  const wSituacao = situacao ? sql`AND p.situacao = ${situacao}` : sql``;

  // tipo_metal: "__sem__" = somente sem metal definido; valor = match exato
  const wTipoMetal =
    tipo_metal === "__sem__" ? sql`AND (p.tipo_metal IS NULL OR TRIM(p.tipo_metal) = '')` :
    tipo_metal                ? sql`AND p.tipo_metal = ${tipo_metal}` :
    sql``;

  // Categoria — pai + filho ("Anel" casa "Anel" e "Anel -> Feminino"; subcategoria afina)
  const wCategoria = categoria
    ? subcategoria
      ? sql`AND TRIM(p.categoria) = ${`${categoria} -> ${subcategoria}`}`
      : sql`AND (TRIM(p.categoria) = ${categoria} OR TRIM(p.categoria) ILIKE ${`${categoria} -> %`})`
    : sql``;

  // Apenas com saldo >= 1 (estoque comercial alissonerp + directus legado + filhos)
  // Centralizado no schema alissonerp (não usa mais public.estoque).
  const wEstoque = apenasComEstoque
    ? sql`AND (
        COALESCE((
          SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)
          FROM alissonerp.movimentacoes_estoque_comercial m
          WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'
        ), 0) >= 1
        OR EXISTS (SELECT 1 FROM alissonerp.vw_estoque_directus_saldo v
                   WHERE v.insumo_sku = p.sku AND v.saldo >= 1)
        OR (
          SELECT COALESCE(SUM(CASE WHEN m2.tipo = 'entrada' THEN m2.quantidade ELSE -m2.quantidade END), 0)
          FROM alissonerp.erp_produtos pai_ep
          INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
          INNER JOIN alissonerp.movimentacoes_estoque_comercial m2 ON m2.produto_id = filho_ep.produto_id
          WHERE pai_ep.produto_id = p.id_produto AND m2.status = 'efetivado'
        ) >= 1
      )`
    : sql``;

  const orderFieldIdent =
    orderField === "nome"                 ? sql`p.nome`               :
    orderField === "sku"                  ? sql`p.sku`                :
    orderField === "preco_sync"           ? sql`p.preco_sync`         :
    orderField === "diferenca_percentual" ? sql`p.diferenca_percentual` :
    orderField === "preco_tiny"           ? sql`p.preco_tiny`         :
    orderField === "peso_precificado"     ? sql`p.peso_precificado`   :
    orderField === "tipo_metal"           ? sql`p.tipo_metal`         :
    orderField === "situacao"             ? sql`p.situacao`           :
    orderField === "qtd_estoque"          ? sql`p.qtd_estoque`        :
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
        LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
        LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
        WHERE TRUE ${wBusca} ${wSkuPrefix} ${wPedra} ${wTipoMetal} ${wSituacao} ${wAgrupamento} ${wVariacoes} ${wCategoria} ${wEstoque} ${wPendencia} ${wEsconderInsumos} ${wTipoItem}
      `;

      const total      = Number(countRow?.total ?? 0);
      const totalPages = Math.ceil(total / limit);

      const produtos = await sql`
        SELECT
          p.id_produto,
          p.nome,
          p.sku,
          p.tipo_metal,
          p.peso_precificado,
          -- Pedras: peso fiel em ct vem de produto_pedra_extras (peso_precificado
          -- é arredondado pelo trigger arredondar_peso_para_cima).
          (SELECT peso_ct FROM alissonerp.produto_pedra_extras
            WHERE produto_id = p.id_produto LIMIT 1) AS peso_ct,
          p.preco_tiny,
          p.preco_sync,
          p.preco_pedras,
          p.preco_total_sync,
          p.diferenca_percentual,
          p.tem_pedra_preciosa,
          p.situacao,
          p.categoria,
          vc.url_capa AS foto_produto,
          COALESCE(vi.imagens, '[]'::jsonb) AS imagens,
          -- Saldo consolidado: MAIOR valor entre 3 fontes (próprio, filhos, directus).
          -- Usa GREATEST (não COALESCE) pra pais com linha em movimentacoes = 0
          -- não ficarem "presos" a esse 0 e sim mostrarem a soma dos filhos.
          GREATEST(
            COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) FROM alissonerp.movimentacoes_estoque_comercial m WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'), 0)::int,
            COALESCE((SELECT SUM(v.saldo) FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku), 0)::int,
            COALESCE((
              SELECT SUM(CASE WHEN m_f.tipo = 'entrada' THEN m_f.quantidade ELSE -m_f.quantidade END)::int
              FROM alissonerp.erp_produtos pai_e
              INNER JOIN alissonerp.erp_produtos filho_e ON filho_e.parent_id = pai_e.id
              INNER JOIN alissonerp.movimentacoes_estoque_comercial m_f ON m_f.produto_id = filho_e.produto_id
              WHERE pai_e.produto_id = p.id_produto AND m_f.status = 'efetivado'
            ), 0)
          ) AS saldo_estoque,
          -- Preço mínimo das variações filhas (quando pai com variable).
          -- Se null, o produto é simples ou não tem filhos com preço.
          (
            SELECT MIN(prod_f.preco_tiny::numeric)::int
            FROM alissonerp.erp_produtos pai_e2
            INNER JOIN alissonerp.erp_produtos filho_e2 ON filho_e2.parent_id = pai_e2.id
            INNER JOIN public.produtos prod_f ON prod_f.id_produto = filho_e2.produto_id
            WHERE pai_e2.produto_id = p.id_produto
              AND prod_f.preco_tiny IS NOT NULL
              AND prod_f.preco_tiny::numeric > 0
          ) AS preco_filhos_min,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN ${wSemCat}   THEN 'sem_categoria' END,
            CASE WHEN ${wSemMetal} THEN 'sem_metal'     END,
            CASE WHEN ${wSemPeso}  THEN 'sem_peso'      END,
            CASE WHEN ${wSemPreco} THEN 'sem_preco'     END
          ], NULL) AS pendencias,
          -- Preço da curva = peso × cotação_ouro × markup_aplicado × fator, arredondado à dezena.
          -- Usa markup_aplicado de produto_curva_aplicada (se a curva foi aplicada);
          -- senão usa o markup da própria public.produtos. Cotação buscada de public.parametros.
          --
          -- EXCEÇÃO: produtos da categoria "Pedras" NÃO entram no racional do ouro —
          -- seu preço vem direto de preco_tiny (cadastro manual, R$/unidade).
          -- Retornamos NULL aqui para que a UI mostre apenas preco_tiny.
          CASE
            WHEN p.categoria ILIKE 'Pedras%' THEN NULL
            WHEN p.peso_precificado > 0
             AND (cpa.markup_aplicado > 0 OR p.markup > 0)
             AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
            THEN ROUND(
              p.peso_precificado::numeric
              * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
              * COALESCE(cpa.markup_aplicado::numeric, p.markup::numeric)
              * COALESCE(p.fator::numeric, 1)
              / 10
            )::int * 10
            ELSE NULL
          END AS preco_curva,
          ti.tipo_item,
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
        LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
        LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
        LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
        WHERE TRUE ${wBusca} ${wSkuPrefix} ${wPedra} ${wTipoMetal} ${wSituacao} ${wAgrupamento} ${wVariacoes} ${wCategoria} ${wEstoque} ${wPendencia} ${wEsconderInsumos} ${wTipoItem}
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
      LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
      WHERE TRUE ${wBusca} ${wSkuPrefix} ${wPedra} ${wTipoMetal} ${wSituacao} ${wCategoria} ${wEstoque} ${wPendencia} ${wEsconderInsumos} ${wTipoItem}
    `;

    const total      = Number(countRow?.total ?? 0);
    const totalPages = Math.ceil(total / limit);

    const produtos = await sql`
      SELECT
        p.id_produto,
        p.nome,
        p.sku,
        p.tipo_metal,
        p.peso_precificado,
        -- Pedras: peso fiel em ct (ver branch erp_produtos acima).
        (SELECT peso_ct FROM alissonerp.produto_pedra_extras
          WHERE produto_id = p.id_produto LIMIT 1) AS peso_ct,
        p.preco_tiny,
        p.preco_sync,
        p.preco_pedras,
        p.preco_total_sync,
        p.diferenca_percentual,
        p.tem_pedra_preciosa,
        p.situacao,
        p.categoria,
        vc.url_capa   AS foto_produto,
        COALESCE(vi.imagens, '[]'::jsonb) AS imagens,
        GREATEST(
          COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) FROM alissonerp.movimentacoes_estoque_comercial m WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'), 0)::int,
          COALESCE((SELECT SUM(v.saldo) FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku), 0)::int
        ) AS saldo_estoque,
        NULL::int AS preco_filhos_min,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN ${wSemCat}   THEN 'sem_categoria' END,
          CASE WHEN ${wSemMetal} THEN 'sem_metal'     END,
          CASE WHEN ${wSemPeso}  THEN 'sem_peso'      END,
          CASE WHEN ${wSemPreco} THEN 'sem_preco'     END
        ], NULL) AS pendencias,
        -- Pedras ficam fora do cálculo (ver comentário na query principal).
        CASE
          WHEN p.categoria ILIKE 'Pedras%' THEN NULL
          WHEN p.peso_precificado > 0
           AND (cpa.markup_aplicado > 0 OR p.markup > 0)
           AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
          THEN ROUND(
            p.peso_precificado::numeric
            * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
            * COALESCE(cpa.markup_aplicado::numeric, p.markup::numeric)
            * COALESCE(p.fator::numeric, 1)
            / 10
          )::int * 10
          ELSE NULL
        END AS preco_curva,
        ti.tipo_item,
        NULL::integer AS erp_id,
        NULL::boolean AS eh_pai,
        NULL::boolean AS eh_variacao,
        NULL::text    AS parent_sku,
        NULL::text    AS sufixo_variacao,
        NULL::text    AS numeracao,
        0::integer    AS qtd_variacoes
      FROM public.produtos p
      LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
      WHERE TRUE ${wBusca} ${wSkuPrefix} ${wPedra} ${wTipoMetal} ${wSituacao} ${wCategoria} ${wEstoque} ${wPendencia} ${wEsconderInsumos} ${wTipoItem}
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
  if (!isFullAccess(role ?? "")) {
    const [perm] = await sql`
      SELECT pode_escrever FROM alissonerp.role_permissoes
      WHERE role = ${role ?? ""} AND modulo = 'produtos'
    `;
    if (!perm?.pode_escrever) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
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
    categoria_geral?: string | null;
    tem_pedra_preciosa?: boolean;
    fornecedor?: string | null;
    medidas?: { largura_aro?: number; altura_aro?: number; base?: number };
    ficha_tecnica_ia?: {
      tipo_peca?: string | null;
      largura?: number | null;
      altura?: number | null;
      profundidade?: number | null;
      diametro_interno?: number | null;
      peso_estimado_metal?: number | null;
      qtd_pedras?: number | null;
      tamanho_pedras_mm?: number | null;
      tamanho_pedras_ct?: number | null;
      tipo_cravacao?: string | null;
      qtd_garras?: number | null;
      largura_garras_mm?: number | null;
      altura_garras_mm?: number | null;
      confianca_pct?: number | null;
      observacoes?: string | null;
    } | null;
    composicao?: ComposicaoItem[];
    variacoes?: VariacoesConfig;
    quantidades?: Record<string, number>;
    foto_base64?: string;
  };

  const { nome, tipo_metal, cor_metal, peso_precificado, markup, fator,
          categoria_precificacao, categoria_geral, tem_pedra_preciosa, fornecedor,
          medidas, ficha_tecnica_ia, composicao, variacoes, quantidades, foto_base64 } = body;

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
           categoria_precificacao, categoria, tem_pedra_preciosa)
        VALUES
          (${paiId}, ${sku}, ${nome.trim()}, ${tipo_metal ?? null}, 'A',
           ${Number(peso_precificado)}, ${Number(markup)}, ${Number(fator ?? 1)},
           ${categoria_precificacao ?? null}, ${categoria_geral ?? null}, ${tem_pedra_preciosa ?? false})
        RETURNING id_produto, sku, nome, preco_sync
      `;

      // INSERT pai em erp_produtos — fornecedor só entra se a coluna existir
      // (migration 159 pendente = não entra, silencioso).
      const temColFornecedor = await colunaExiste("alissonerp", "erp_produtos", "fornecedor", tx);
      const [erpPai] = temColFornecedor
        ? await tx<{ id: number; produto_id: number; sku: string }[]>`
            INSERT INTO alissonerp.erp_produtos
              (produto_id, sku, nome, eh_pai, eh_variacao,
               cor_metal, largura_aro, altura_aro, base, fornecedor)
            VALUES
              (${paiId}, ${sku}, ${nome.trim()}, ${temVariacoes}, false,
               ${cor_metal ?? null},
               ${medidas?.largura_aro ?? null},
               ${medidas?.altura_aro  ?? null},
               ${medidas?.base        ?? null},
               ${fornecedor ?? null})
            RETURNING id, produto_id, sku
          `
        : await tx<{ id: number; produto_id: number; sku: string }[]>`
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

      // Mestre de fornecedores: só UPSERT se a tabela existir.
      if (fornecedor && fornecedor.trim() && await tabelaExiste("alissonerp", "fornecedores", tx)) {
        await tx`
          INSERT INTO alissonerp.fornecedores (nome)
          VALUES (${fornecedor.trim()})
          ON CONFLICT (nome) DO UPDATE SET ativo = true
        `;
      }

      // INSERT ficha técnica com medidas da IA (se disponível)
      if (ficha_tecnica_ia) {
        await tx`
          INSERT INTO alissonerp.fichas_tecnicas_produto
            (produto_id, tipo_peca, largura, altura, profundidade, diametro_interno,
             peso_estimado_metal, qtd_pedras, tamanho_pedras_mm, tamanho_pedras_ct,
             tipo_cravacao, qtd_garras, largura_garra, altura_garra,
             ia_confianca, ia_provider)
          VALUES
            (${paiId},
             ${ficha_tecnica_ia.tipo_peca ?? null},
             ${ficha_tecnica_ia.largura ?? null},
             ${ficha_tecnica_ia.altura ?? null},
             ${ficha_tecnica_ia.profundidade ?? null},
             ${ficha_tecnica_ia.diametro_interno ?? null},
             ${ficha_tecnica_ia.peso_estimado_metal ?? null},
             ${ficha_tecnica_ia.qtd_pedras ?? 0},
             ${ficha_tecnica_ia.tamanho_pedras_mm ?? null},
             ${ficha_tecnica_ia.tamanho_pedras_ct ?? null},
             ${ficha_tecnica_ia.tipo_cravacao ?? null},
             ${ficha_tecnica_ia.qtd_garras ?? 0},
             ${ficha_tecnica_ia.largura_garras_mm ?? null},
             ${ficha_tecnica_ia.altura_garras_mm ?? null},
             ${ficha_tecnica_ia.confianca_pct ?? null},
             'ia')
          ON CONFLICT (produto_id)
          DO UPDATE SET
            tipo_peca = EXCLUDED.tipo_peca,
            largura = EXCLUDED.largura,
            altura = EXCLUDED.altura,
            profundidade = EXCLUDED.profundidade,
            diametro_interno = EXCLUDED.diametro_interno,
            peso_estimado_metal = EXCLUDED.peso_estimado_metal,
            qtd_pedras = EXCLUDED.qtd_pedras,
            tamanho_pedras_mm = EXCLUDED.tamanho_pedras_mm,
            tamanho_pedras_ct = EXCLUDED.tamanho_pedras_ct,
            tipo_cravacao = EXCLUDED.tipo_cravacao,
            qtd_garras = EXCLUDED.qtd_garras,
            largura_garra = EXCLUDED.largura_garra,
            altura_garra = EXCLUDED.altura_garra,
            ia_confianca = EXCLUDED.ia_confianca,
            updated_at = now()
        `;
      }

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

        // INSERT variação em erp_produtos (fornecedor opcional)
        if (temColFornecedor) {
          await tx`
            INSERT INTO alissonerp.erp_produtos
              (produto_id, sku, nome,
               parent_sku, parent_id,
               eh_variacao, eh_pai,
               sufixo_variacao, numeracao, cor_metal, comprimento,
               largura_aro, altura_aro, base, fornecedor)
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
               ${medidas?.base        ?? null},
               ${fornecedor ?? null})
          `;
        } else {
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
        }

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

      // ── Estoque inicial: registra entrada em movimentacoes_estoque_comercial ─
      // body.quantidades = { "16": 2, "18": 1 } → casa com combo.numeracao.
      // Centralizado no schema alissonerp (não usa mais public.estoque).
      const temColLocalEstoque = await colunaExiste("alissonerp", "movimentacoes_estoque_comercial", "local_estoque_id", tx);
      if (quantidades && Object.keys(quantidades).length > 0) {
        for (const v of variacoesCriadas) {
          const match = v.sku.match(/-(\d+)$/);
          if (!match) continue;
          const idxCombo = variacoesCriadas.findIndex((x) => x.sku === v.sku);
          const comboN = combos[idxCombo]?.numeracao;
          if (comboN == null) continue;
          const qtd = quantidades[String(comboN)];
          if (!qtd || qtd <= 0) continue;
          if (temColLocalEstoque) {
            await tx`
              INSERT INTO alissonerp.movimentacoes_estoque_comercial
                (produto_id, tipo, quantidade, motivo, local_estoque_id, status, created_by)
              VALUES
                (${v.produto_id}, 'entrada', ${qtd}, 'estoque_inicial_cadastro', 2, 'efetivado', ${user.id})
            `;
          } else {
            await tx`
              INSERT INTO alissonerp.movimentacoes_estoque_comercial
                (produto_id, tipo, quantidade, motivo, status, created_by)
              VALUES
                (${v.produto_id}, 'entrada', ${qtd}, 'estoque_inicial_cadastro', 'efetivado', ${user.id})
            `;
          }
        }
      }

      return { pai: prodPai, erp: erpPai, variacoes: variacoesCriadas };
    });

    // ── Recalcular preço de pedras (fora da transação) ───────────────────────
    // Protegido por try-catch — se falhar (ex: tabela markup_pedras ausente),
    // não quebra o cadastro. O preço das pedras pode ser recalculado depois.
    if (temPedra) {
      try {
        await recalcularPrecoPedras(result.pai.id_produto);
        for (const v of result.variacoes) {
          await recalcularPrecoPedras(v.produto_id);
        }
      } catch (err) {
        console.warn("[POST /api/produtos] falha ao recalcular preço das pedras:", err);
      }
    }

    // ── Aplicar curva de precificacao (markup automatico) ─────────────────────
    // Nao bloqueia a resposta — se falhar, registra no log e segue.
    try {
      await aplicarCurvaProduto(result.pai.id_produto);
      for (const v of result.variacoes) {
        await aplicarCurvaProduto(v.produto_id);
      }
    } catch (err) {
      console.warn("[POST /api/produtos] falha ao aplicar curva:", err);
    }

    // ── Upload de foto ────────────────────────────────────────────────────────
    if (foto_base64 && typeof foto_base64 === "string" && foto_base64.startsWith("data:")) {
      try {
        await ensureBucket("produto-fotos");
        const matches = foto_base64.match(/^data:([^;]+);base64,/);
        const mimeType = matches?.[1] ?? "image/jpeg";
        const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";
        const fileName = `produto-${result.pai.id_produto}-${Date.now()}.${ext}`;
        const uploaded = await uploadFile("produto-fotos", fileName, foto_base64, mimeType);
        if (!("error" in uploaded)) {
          await sql`UPDATE public.produtos SET imagem = ${uploaded.url} WHERE id_produto = ${result.pai.id_produto}`;
        }
      } catch (err) {
        console.warn("[POST /api/produtos] falha ao fazer upload da foto:", err);
      }
    }

    // ── Sincronização com Tiny (não-bloqueante) ──────────────────────────
    // Antes o sync era síncrono: para N variações, esperava N × 12s (timeout HTTP).
    // Isso causava erro 500 (timeout Vercel 10s) com produtos de 35+ variações.
    // Agora roda em background — se falhar, o CRON (tiny_sync_produtos) completa.
    const todosSyncIds = [result.pai.id_produto, ...result.variacoes.map((v: { produto_id: number }) => v.produto_id)];

    // 1. Enfileira todos na fila (rápido, só INSERT no banco)
    for (const pid of todosSyncIds) {
      try {
        await sql`
          INSERT INTO alissonerp.tiny_sync_produtos (produto_id, operacao, status)
          VALUES (${pid}, 'create', 'pendente')
          ON CONFLICT (produto_id) DO UPDATE SET operacao = 'create', status = 'pendente', tentativas = 0, updated_at = NOW()
        `;
      } catch (err) {
        console.warn("[POST /api/produtos] falha ao enfileirar sync Tiny:", err);
      }
    }

    // 2. Dispara syncs em background (fire-and-forget) — não bloqueia a resposta.
    //    A fila tiny_sync_produtos já garante fallback via CRON se falhar.
    for (const pid of todosSyncIds) {
      syncProdutoToTiny(pid, "create").catch((err) => {
        console.warn(`[POST /api/produtos] sync background falhou pid=${pid}:`, err);
      });
    }

    // Notifica o site em background
    dispararWebhookBackground("produto_criado_site", {
      evento: "produto.criado",
      produto_id: result.pai?.id_produto,
      nome: result.pai?.nome,
      situacao: result.pai?.situacao,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        produto: result.pai,
        erp: result.erp,
        variacoes: result.variacoes,
        totalCriados: 1 + result.variacoes.length,
        tiny_sync: "background", // syncs rodam em background — fila tiny_sync_produtos garante fallback
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/produtos]", err);
    return NextResponse.json({ error: "Erro ao criar produto" }, { status: 500 });
  }
}
