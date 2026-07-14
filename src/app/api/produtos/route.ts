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
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { aplicarCurvaProduto } from "@/lib/aplicar-curva-produto";
import { colunaExiste, tabelaExiste } from "@/lib/schema-check";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { dispararWebhookBackground } from "@/lib/webhooks-server";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";
import { zodError } from "@/lib/schemas/common";
import { LIMITS } from "@/lib/payload-limits";

// Schema permissivo (passthrough) — produto novo tem dezenas de campos
// calculados/opcionais e listas complexas (composicao, variacoes, quantidades).
// Validamos a forma + obrigatorios criticos; o handler ja cobre regras de
// negocio (peso > 0, markup > 0, SKU unico, etc).
const ProdutosPostSchema = z.object({
  nome: z.string().min(1, "nome é obrigatório").max(LIMITS.NOME_MAX),
  sku: z.string().max(100).optional(),
  tipo_metal: z.string().max(100).optional(),
  cor_metal: z.string().max(100).optional(),
  peso_precificado: z.number().positive("peso_precificado inválido"),
  markup: z.number().positive("Categoria não encontrada para o peso informado"),
  fator: z.number().nonnegative().optional(),
  categoria_precificacao: z.string().max(200).optional(),
  categoria_geral: z.string().max(200).nullable().optional(),
  tem_pedra_preciosa: z.boolean().optional(),
  fornecedor: z.string().max(200).nullable().optional(),
  medidas: z.record(z.string(), z.unknown()).optional(),
  ficha_tecnica_ia: z.record(z.string(), z.unknown()).nullable().optional(),
  composicao: z.array(z.record(z.string(), z.unknown())).max(200).optional(),
  variacoes: z.record(z.string(), z.unknown()).optional(),
  quantidades: z.record(z.string(), z.number()).optional(),
  foto_base64: z.string().max(LIMITS.IMAGE_BASE64_MAX).optional(),
}).passthrough();

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
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    const [perm] = await sql`
      SELECT pode_ler FROM alissonerp.role_permissoes
      WHERE role = ${user.role} AND modulo = 'produtos'
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

  // Apenas com saldo disponível >= 1 (usa a mesma view do módulo de Estoque).
  const wEstoque = apenasComEstoque
    ? sql`AND COALESCE(est.disponivel, 0) >= 1`
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
        LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
        LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
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
          -- Peso da FONTE (alissonerp.erp_produtos) — mesma origem usada no calculo
          -- do preco (vw_produtos_geral_preco). O espelho public.produtos so replica
          -- INSERT, nao UPDATE, entao ao editar o peso o public ficava com o valor
          -- antigo e a tela exibia peso diferente do preco. Fallback p.* so se nao houver erp.
          COALESCE(ep.peso_precificado, p.peso_precificado) AS peso_precificado,
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
          -- Saldo único via view oficial do estoque (físico - reservado = disponível).
          -- Produtos pai (com variações) somam o disponível dos filhos.
          COALESCE(CASE WHEN ep.eh_pai = true THEN (
            SELECT COALESCE(SUM(filho_est.disponivel), 0)::int
            FROM alissonerp.erp_produtos filho_ep
            LEFT JOIN alissonerp.vw_saldo_estoque_comercial filho_est ON filho_est.produto_id = filho_ep.produto_id
            WHERE filho_ep.parent_id = ep.id
          ) ELSE est.disponivel END, 0)::int AS saldo_estoque,
          -- Preço mínimo das variações filhas (quando pai com variable).
          -- Se null, o produto é simples ou não tem filhos com preço calculado.
          (
            SELECT MIN(pp_f.preco_venda::numeric)::int
            FROM alissonerp.erp_produtos pai_e2
            INNER JOIN alissonerp.erp_produtos filho_e2 ON filho_e2.parent_id = pai_e2.id
            LEFT JOIN alissonerp.vw_produtos_geral_preco pp_f ON pp_f.id_produto = filho_e2.produto_id
            WHERE pai_e2.produto_id = p.id_produto
              AND pp_f.preco_venda IS NOT NULL
              AND pp_f.preco_venda::numeric > 0
          ) AS preco_filhos_min,
          ARRAY_REMOVE(ARRAY[
            CASE WHEN ${wSemCat}   THEN 'sem_categoria' END,
            CASE WHEN ${wSemMetal} THEN 'sem_metal'     END,
            CASE WHEN ${wSemPeso}  THEN 'sem_peso'      END,
            CASE WHEN ${wSemPreco} THEN 'sem_preco'     END
          ], NULL) AS pendencias,
          -- Promocao vigente (migration 248) - preco_tiny do produto continua intacto.
          vpv.preco_vigente,
          vpv.em_promocao,
          vpv.nome_campanha,
          vpv.data_fim AS promo_data_fim,
          -- ═══════════════════════════════════════════════════════════════════
          -- REGRA DE NEGÓCIO (atualizada 28/05/2026):
          --   preco_curva usa a view unificada vw_produtos_geral_preco.
          --   Joias → curva dinâmica (ouro + BOM).
          --   Pedras/Insumos → regras de precificação (vw_pedras_preco).
          --     Exceção (fix 2026-06-30): pedra avulsa SEM regra casada cai no
          --     preco_tiny DENTRO da própria vw_pedras_preco (fonte única) —
          --     NÃO aqui no código. Ver docs/seguranca/fix-pedra-avulsa-preco-proprio-2026-06-30.sql
          --   Serviço (tipo_item='servico') → preço fixo via preco_servico.
          --   NÃO adicionar fallback para preco_tiny ou preco_sync NESTE código (a view resolve).
          --   Produto sem peso → sem preço calculado (intencional).
          -- ═══════════════════════════════════════════════════════════════════
          pp.preco_venda::int AS preco_curva,
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
          ) ELSE 0 END AS qtd_variacoes,
          -- Ct total das pedras preciosas vinculadas (exceto zircônia)
          (
            SELECT COALESCE(SUM(
              ppc.quantidade::numeric *
              CASE ROUND(CAST(REPLACE(COALESCE(
                (REGEXP_MATCH(COALESCE(pp2.nome,''), '([0-9]+[,.][0-9]+)mm'))[1],
                '0'), ',', '.') AS numeric), 1)
                WHEN 1.0 THEN 0.005 WHEN 1.1 THEN 0.006 WHEN 1.2 THEN 0.007
                WHEN 1.3 THEN 0.009 WHEN 1.4 THEN 0.012 WHEN 1.5 THEN 0.015
                WHEN 1.6 THEN 0.017 WHEN 1.7 THEN 0.019 WHEN 1.8 THEN 0.022
                WHEN 1.9 THEN 0.026 WHEN 2.0 THEN 0.030 WHEN 2.1 THEN 0.035
                WHEN 2.2 THEN 0.040 WHEN 2.3 THEN 0.046 WHEN 2.4 THEN 0.053
                WHEN 2.5 THEN 0.060
                ELSE 0
              END
            ), 0)
            FROM alissonerp.produto_pedras_componente ppc
            LEFT JOIN public.produtos pp2 ON pp2.id_produto = ppc.pedra_produto_id
            WHERE ppc.produto_id = p.id_produto
              AND pp2.nome NOT ILIKE '%zirconia%'
          ) AS pedras_ct_total,
          -- Quantidade total e nome principal das pedras (para coluna na lista)
          (
            SELECT COALESCE(SUM(ppc2.quantidade), 0)::int
            FROM alissonerp.produto_pedras_componente ppc2
            LEFT JOIN public.produtos pp3 ON pp3.id_produto = ppc2.pedra_produto_id
            WHERE ppc2.produto_id = p.id_produto
              AND pp3.nome NOT ILIKE '%zirconia%'
          ) AS pedras_qtd_total,
          (
            SELECT pp3.nome
            FROM alissonerp.produto_pedras_componente ppc2
            LEFT JOIN public.produtos pp3 ON pp3.id_produto = ppc2.pedra_produto_id
            WHERE ppc2.produto_id = p.id_produto
              AND pp3.nome NOT ILIKE '%zirconia%'
            ORDER BY ppc2.quantidade DESC
            LIMIT 1
          ) AS pedras_nome_principal,
          COALESCE(ecc.controla_estoque, true) AS controla_estoque
        FROM public.produtos p
        LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
        LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
        LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
        LEFT JOIN alissonerp.vw_produto_preco_vigente vpv ON vpv.id_produto = p.id_produto
        LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
        LEFT JOIN alissonerp.vw_produtos_geral_preco pp ON pp.id_produto = p.id_produto
        LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
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
      LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
      LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
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
        COALESCE(est.disponivel, 0)::int AS saldo_estoque,
        NULL::int AS preco_filhos_min,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN ${wSemCat}   THEN 'sem_categoria' END,
          CASE WHEN ${wSemMetal} THEN 'sem_metal'     END,
          CASE WHEN ${wSemPeso}  THEN 'sem_peso'      END,
          CASE WHEN ${wSemPreco} THEN 'sem_preco'     END
        ], NULL) AS pendencias,
        -- Promocao vigente (migration 248)
        vpv.preco_vigente,
        vpv.em_promocao,
        vpv.nome_campanha,
        vpv.data_fim AS promo_data_fim,
        -- Preço da curva — calculado pela view unificada vw_produtos_geral_preco.
        pp.preco_venda AS preco_curva,
        ti.tipo_item,
        NULL::integer AS erp_id,
        NULL::boolean AS eh_pai,
        NULL::boolean AS eh_variacao,
        NULL::text    AS parent_sku,
        NULL::text    AS sufixo_variacao,
        NULL::text    AS numeracao,
        0::integer    AS qtd_variacoes,
        (
          SELECT COALESCE(SUM(
            ppc.quantidade::numeric *
            CASE ROUND(CAST(REPLACE(COALESCE(
              (REGEXP_MATCH(COALESCE(pp2.nome,''), '([0-9]+[,.][0-9]+)mm'))[1],
              '0'), ',', '.') AS numeric), 1)
              WHEN 1.0 THEN 0.005 WHEN 1.1 THEN 0.006 WHEN 1.2 THEN 0.007
              WHEN 1.3 THEN 0.009 WHEN 1.4 THEN 0.012 WHEN 1.5 THEN 0.015
              WHEN 1.6 THEN 0.017 WHEN 1.7 THEN 0.019 WHEN 1.8 THEN 0.022
              WHEN 1.9 THEN 0.026 WHEN 2.0 THEN 0.030 WHEN 2.1 THEN 0.035
              WHEN 2.2 THEN 0.040 WHEN 2.3 THEN 0.046 WHEN 2.4 THEN 0.053
              WHEN 2.5 THEN 0.060
              ELSE 0
            END
          ), 0)
          FROM alissonerp.produto_pedras_componente ppc
          LEFT JOIN public.produtos pp2 ON pp2.id_produto = ppc.pedra_produto_id
          WHERE ppc.produto_id = p.id_produto
            AND pp2.nome NOT ILIKE '%zirconia%'
        ) AS pedras_ct_total,
        (
          SELECT COALESCE(SUM(ppc2.quantidade), 0)::int
          FROM alissonerp.produto_pedras_componente ppc2
          LEFT JOIN public.produtos pp3 ON pp3.id_produto = ppc2.pedra_produto_id
          WHERE ppc2.produto_id = p.id_produto
            AND pp3.nome NOT ILIKE '%zirconia%'
        ) AS pedras_qtd_total,
        (
          SELECT pp3.nome
          FROM alissonerp.produto_pedras_componente ppc2
          LEFT JOIN public.produtos pp3 ON pp3.id_produto = ppc2.pedra_produto_id
          WHERE ppc2.produto_id = p.id_produto
            AND pp3.nome NOT ILIKE '%zirconia%'
          ORDER BY ppc2.quantidade DESC
          LIMIT 1
        ) AS pedras_nome_principal,
        COALESCE(ecc.controla_estoque, true) AS controla_estoque
      FROM public.produtos p
      LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
      LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produto_preco_vigente vpv ON vpv.id_produto = p.id_produto
      LEFT JOIN alissonerp.vw_saldo_estoque_comercial est ON est.produto_id = p.id_produto
      LEFT JOIN alissonerp.vw_produtos_geral_preco pp ON pp.id_produto = p.id_produto
      LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
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
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    const [perm] = await sql`
      SELECT pode_escrever FROM alissonerp.role_permissoes
      WHERE role = ${user.role} AND modulo = 'produtos'
    `;
    if (!perm?.pode_escrever) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsedBody = ProdutosPostSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  // body legado tem variacoes/composicao/medidas com shape interno proprio.
  // Cast pra `any` evita perda de inferencia ao destruturar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = parsedBody.data as any;

  const { nome, tipo_metal, cor_metal, peso_precificado, markup, fator,
          categoria_precificacao, categoria_geral, tem_pedra_preciosa, fornecedor,
          medidas, ficha_tecnica_ia, composicao, variacoes, quantidades, foto_base64 } = body;

  try {
    // ── Determinar SKU ───────────────────────────────────────────────────────
    let sku = body.sku?.trim() ?? "";
    if (!sku) {
      const [skuRow] = await sql<{ next: string }[]>`
        SELECT (COALESCE(MAX(sku::integer), 1603) + 1)::text AS next
        FROM public.produtos WHERE sku ~ '^[0-9]{1,5}$'
      `;
      sku = skuRow?.next ?? "1604";
    }

    // ── Validar formato do SKU ───────────────────────────────────────────────
    const SKU_REGEX = /^([0-9]{1,5}|AJ[0-9]{4})$/;
    if (!SKU_REGEX.test(sku)) {
      return NextResponse.json({ error: `SKU "${sku}" fora do padrão (numérico até 5 dígitos ou AJ + 4 dígitos)` }, { status: 400 });
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

      // INSERT pai em alissonerp.erp_produtos (todos os campos em 1 row)
      // NOTA: tabela tem UNIQUE(produto_id) e UNIQUE(sku) — NÃO podem existir 2 rows com mesmo produto_id.
      const temColFornecedor = await colunaExiste("alissonerp", "erp_produtos", "fornecedor", tx);
      const [erpPai] = temColFornecedor
        ? await tx<{ id: number; id_produto: number; sku: string; nome: string; preco_sync: string | null }[]>`
            INSERT INTO alissonerp.erp_produtos
              (produto_id, sku, nome, tipo_metal, situacao,
               peso_precificado, markup, fator,
               categoria_precificacao, categoria, tem_pedra_preciosa,
               eh_pai, eh_variacao,
               cor_metal, largura_aro, altura_aro, base, fornecedor)
            VALUES
              (${paiId}, ${sku}, ${nome.trim()}, ${tipo_metal ?? null}, 'A',
               ${Number(peso_precificado)}, ${Number(markup)}, ${Number(fator ?? 1)},
               ${categoria_precificacao ?? null}, ${categoria_geral ?? null}, ${tem_pedra_preciosa ?? false},
               ${temVariacoes}, false,
               ${cor_metal ?? null},
               ${medidas?.largura_aro ?? null},
               ${medidas?.altura_aro  ?? null},
               ${medidas?.base        ?? null},
               ${fornecedor ?? null})
            RETURNING id, produto_id AS id_produto, sku, nome, preco_sync
          `
        : await tx<{ id: number; id_produto: number; sku: string; nome: string; preco_sync: string | null }[]>`
            INSERT INTO alissonerp.erp_produtos
              (produto_id, sku, nome, tipo_metal, situacao,
               peso_precificado, markup, fator,
               categoria_precificacao, categoria, tem_pedra_preciosa,
               eh_pai, eh_variacao,
               cor_metal, largura_aro, altura_aro, base)
            VALUES
              (${paiId}, ${sku}, ${nome.trim()}, ${tipo_metal ?? null}, 'A',
               ${Number(peso_precificado)}, ${Number(markup)}, ${Number(fator ?? 1)},
               ${categoria_precificacao ?? null}, ${categoria_geral ?? null}, ${tem_pedra_preciosa ?? false},
               ${temVariacoes}, false,
               ${cor_metal ?? null},
               ${medidas?.largura_aro ?? null},
               ${medidas?.altura_aro  ?? null},
               ${medidas?.base        ?? null})
            RETURNING id, produto_id AS id_produto, sku, nome, preco_sync
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
        const pesoPrec = Number(peso_precificado);

        const sufixos: string[] = [];
        if (combo.numeracao != null) sufixos.push(`nº ${combo.numeracao}`);
        if (combo.cor_metal && combo.cor_metal !== cor_metal) sufixos.push(combo.cor_metal);
        if (combo.comprimento != null) sufixos.push(`${combo.comprimento}cm`);
        const nomeVar = sufixos.length > 0 ? `${nome.trim()} ${sufixos.join(" ")}` : `${nome.trim()} ${contador}`;

        // INSERT variação em alissonerp.erp_produtos (todos os campos em 1 row)
        // UNIQUE(produto_id) e UNIQUE(sku) impedem 2 rows por variação.
        if (temColFornecedor) {
          await tx`
            INSERT INTO alissonerp.erp_produtos
              (produto_id, sku, nome, tipo_metal, situacao,
               peso_precificado, markup, fator,
               categoria_precificacao, tem_pedra_preciosa,
               parent_sku, parent_id,
               eh_variacao, eh_pai,
               sufixo_variacao, numeracao, cor_metal, comprimento,
               largura_aro, altura_aro, base, fornecedor)
            VALUES
              (${varId}, ${skuVar}, ${nomeVar},
               ${combo.cor_metal ?? tipo_metal ?? null}, 'A',
               ${pesoPrec}, ${Number(markup)}, ${Number(fator ?? 1)},
               ${categoria_precificacao ?? null}, ${tem_pedra_preciosa ?? false},
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
              (produto_id, sku, nome, tipo_metal, situacao,
               peso_precificado, markup, fator,
               categoria_precificacao, tem_pedra_preciosa,
               parent_sku, parent_id,
               eh_variacao, eh_pai,
               sufixo_variacao, numeracao, cor_metal, comprimento,
               largura_aro, altura_aro, base)
            VALUES
              (${varId}, ${skuVar}, ${nomeVar},
               ${combo.cor_metal ?? tipo_metal ?? null}, 'A',
               ${pesoPrec}, ${Number(markup)}, ${Number(fator ?? 1)},
               ${categoria_precificacao ?? null}, ${tem_pedra_preciosa ?? false},
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

      return { pai: erpPai, erp: erpPai, variacoes: variacoesCriadas };
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
    } catch (err) {
      console.warn("[POST /api/produtos] falha ao aplicar curva:", err);
    }

    // ── Aplicar rota padrão (Alisson + categoria com template default) ───────
    // Só aplica em produtos NOVOS — nunca sobrescreve rota já cadastrada.
    try {
      const { aplicarRotaPadrao } = await import("@/lib/aplicar-rota-padrao");
      await aplicarRotaPadrao(result.pai.id_produto);
      for (const v of result.variacoes) {
        await aplicarRotaPadrao(v.produto_id);
      }
    } catch (err) {
      console.warn("[POST /api/produtos] falha ao aplicar rota padrão:", err);
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
          await sql`UPDATE alissonerp.erp_produtos SET imagem = ${uploaded.url} WHERE produto_id = ${result.pai.id_produto}`;
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
