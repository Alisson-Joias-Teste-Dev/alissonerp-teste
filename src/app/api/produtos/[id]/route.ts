/**
 * GET  /api/produtos/[id]  — detalhe com composição + erp_produtos (medidas, pai/var)
 * PATCH /api/produtos/[id] — campos editáveis: tem_pedra_preciosa (public.produtos)
 *                            + observacao_erp, medidas (erp_produtos upsert)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { recalcularPrecoPedras } from "@/lib/recalcular-preco-pedras";
import { colunaExiste, tabelaExiste } from "@/lib/schema-check";
import { aplicarCurvaProduto } from "@/lib/aplicar-curva-produto";
import { uploadFile, ensureBucket } from "@/lib/storage";
import { dispararWebhookBackground } from "@/lib/webhooks-server";
import { syncProdutoToTiny } from "@/lib/produto-tiny-sync";
import { zodError } from "@/lib/schemas/common";
import { LIMITS } from "@/lib/payload-limits";

// Schema permissivo (passthrough) — PATCH aceita qualquer subconjunto dos
// campos editaveis. Validacoes de tipo numerico/range continuam no handler
// (que ja faz checks granulares por campo, ex: peso_precificado >= 0).
const ProdutosPatchSchema = z.object({
  nome: z.string().max(LIMITS.NOME_MAX).optional(),
  sku: z.string().max(100).optional(),
  tipo_metal: z.string().max(100).nullable().optional(),
  categoria_geral: z.string().max(200).nullable().optional(),
  situacao: z.enum(["A", "I"]).optional(),
  tem_pedra_preciosa: z.boolean().optional(),
  peso_precificado: z.number().nullable().optional(),
  markup: z.number().nullable().optional(),
  fator: z.number().nullable().optional(),
  categoria_precificacao: z.string().max(200).nullable().optional(),
  preco_tiny: z.number().nullable().optional(),
  preco_compra_usd: z.number().nullable().optional(),
  quantidade_pedra: z.number().int().nullable().optional(),
  tipo_item: z.string().max(50).nullable().optional(),
  observacao_erp: z.string().max(LIMITS.OBSERVACOES_MAX).optional(),
  largura_aro: z.number().nullable().optional(),
  altura_aro: z.number().nullable().optional(),
  base: z.number().nullable().optional(),
  fornecedor: z.string().max(200).nullable().optional(),
  foto_base64: z.string().max(LIMITS.IMAGE_BASE64_MAX).optional(),
  aplicar_rota_padrao: z.boolean().optional(),
  preco_servico: z.number().nullable().optional(),
  controla_estoque: z.boolean().optional(),
}).passthrough();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    // ── Verificar se migration 063 está aplicada ─────────────────────────────
    const [tableRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
      ) AS exists
    `;
    const erpDisponivel = tableRow?.exists === true;

    // ── SELECT produto ────────────────────────────────────────────────────────
    const [produto] = erpDisponivel
      ? await sql`
          SELECT
            p.id_produto,
            p.nome,
            p.sku,
            p.tipo_metal,
            p.peso_precificado,
            p.preco_tiny,
            p.preco_sync,
            p.preco_pedras,
            p.preco_total_sync,
            p.diferenca_percentual,
            p.tem_pedra_preciosa,
            p.situacao,
            vc.url_capa  AS foto_produto,
            COALESCE(vi.imagens, '[]'::jsonb) AS imagens,
            NULL::text   AS descricao,
            NULL::text   AS referencia,
            p.categoria_precificacao AS categoria,
            p.categoria              AS categoria_geral,
            p.markup,
            p.fator,
            -- Preço calculado pela view oficial vw_produto_preco (curva dinâmica).
            pp.preco_venda AS preco_curva,
            (SELECT tipo_item FROM alissonerp.produto_tipo_item WHERE produto_id = p.id_produto) AS tipo_item,
            NULL::text   AS sub_categoria,
            ppe.preco_compra_usd  AS preco_compra_usd,
            ppe.quantidade        AS quantidade_pedra,
            ppe.peso_ct           AS peso_ct,
            ep.id        AS erp_id,
            ep.eh_pai,
            ep.eh_variacao,
            ep.parent_sku,
            ep.numeracao,
            ep.cor_metal,
            ep.comprimento,
            ep.largura_aro,
            ep.altura_aro,
            ep.base,
            ep.observacao_erp,
            CASE WHEN ep.eh_pai = true THEN (
              SELECT count(*)::integer
              FROM alissonerp.erp_produtos filhos
              WHERE filhos.parent_id = ep.id
            ) ELSE 0 END AS qtd_variacoes,
            p.id_api_produto,
            ts.status AS tiny_sync_status,
            ts.erro   AS tiny_sync_erro,
            ep.preco_servico,
            COALESCE(ecc.controla_estoque, true) AS controla_estoque
          FROM public.produtos p
          LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
          LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
          LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
          LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
          LEFT JOIN alissonerp.tiny_sync_produtos ts ON ts.produto_id = p.id_produto
          LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
          LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
          WHERE p.id_produto = ${produtoId}
        `
      : await sql`
          SELECT
            p.id_produto,
            p.nome,
            p.sku,
            p.tipo_metal,
            p.peso_precificado,
            p.preco_tiny,
            p.preco_sync,
            p.preco_pedras,
            p.preco_total_sync,
            p.diferenca_percentual,
            p.tem_pedra_preciosa,
            p.situacao,
            vc.url_capa   AS foto_produto,
            COALESCE(vi.imagens, '[]'::jsonb) AS imagens,
            NULL::text    AS descricao,
            NULL::text    AS referencia,
            p.categoria_precificacao AS categoria,
            p.categoria              AS categoria_geral,
            p.markup,
            p.fator,
            -- Preço calculado pela view oficial vw_produto_preco (curva dinâmica).
            pp.preco_venda AS preco_curva,
            (SELECT tipo_item FROM alissonerp.produto_tipo_item WHERE produto_id = p.id_produto) AS tipo_item,
            NULL::text    AS sub_categoria,
            ppe.preco_compra_usd  AS preco_compra_usd,
            ppe.quantidade        AS quantidade_pedra,
            ppe.peso_ct           AS peso_ct,
            NULL::integer AS erp_id,
            NULL::boolean AS eh_pai,
            NULL::boolean AS eh_variacao,
            NULL::text    AS parent_sku,
            NULL::text    AS numeracao,
            NULL::text    AS cor_metal,
            NULL::numeric AS comprimento,
            NULL::numeric AS largura_aro,
            NULL::numeric AS altura_aro,
            NULL::numeric AS base,
            NULL::text    AS observacao_erp,
            NULL::text    AS fornecedor,
            NULL::numeric AS preco_servico,
            0::integer    AS qtd_variacoes,
            p.id_api_produto,
            ts.status AS tiny_sync_status,
            ts.erro   AS tiny_sync_erro,
            COALESCE(ecc.controla_estoque, true) AS controla_estoque
          FROM public.produtos p
          LEFT JOIN alissonerp.vw_produto_capa vc ON vc.produto_id = p.id_produto
          LEFT JOIN alissonerp.vw_produto_imagens vi ON vi.produto_id = p.id_produto
          LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
          LEFT JOIN alissonerp.tiny_sync_produtos ts ON ts.produto_id = p.id_produto
          LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
          LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = p.id_produto
          WHERE p.id_produto = ${produtoId}
        `;

    if (!produto) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const composicao = await sql`
      SELECT
        pc.id,
        pc.insumo_id,
        i.nome      AS insumo_nome,
        i.unidade   AS insumo_unidade,
        pc.tipo,
        pc.quantidade,
        pc.tamanho,
        pc.unidade_tamanho,
        pc.preco_compra_usd,
        pc.obrigatorio,
        pc.observacao
      FROM alissonerp.produto_composicao pc
      LEFT JOIN alissonerp.insumos i ON i.id = pc.insumo_id
      WHERE pc.produto_id = ${produtoId}
      ORDER BY pc.tipo, pc.id
    `;

    // Variações: só se for pai e erp disponível
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let variacoes: any[] = [];
    if (erpDisponivel && produto.eh_pai && produto.erp_id) {
      variacoes = await sql`
        SELECT
          ep.id        AS erp_id,
          ep.produto_id,
          ep.sku,
          ep.nome,
          ep.sufixo_variacao,
          ep.numeracao,
          ep.cor_metal,
          ep.largura_aro,
          ep.altura_aro,
          ep.base,
          p.peso_precificado,
          pp.preco_venda AS preco,
          p.situacao
        FROM alissonerp.erp_produtos ep
        JOIN public.produtos p ON p.id_produto = ep.produto_id
        LEFT JOIN alissonerp.vw_produto_preco pp ON pp.id_produto = p.id_produto
        WHERE ep.parent_id = ${produto.erp_id as number}
        ORDER BY
          NULLIF(regexp_replace(ep.sufixo_variacao, '[^0-9]', '', 'g'), '')::integer NULLS LAST,
          ep.sufixo_variacao ASC NULLS LAST
      `;
    }

    // Cotação atual do ouro e dólar (para cálculo em runtime no drawer)
    const [cot] = await sql<{ cotacao_ouro: string | null; cotacao_dolar: string | null }[]>`
      SELECT cotacao_ouro, cotacao_dolar FROM alissonerp.parametros LIMIT 1
    `;
    const cotacao_ouro  = Number(cot?.cotacao_ouro ?? 0);
    const cotacao_dolar = Number(cot?.cotacao_dolar ?? 0);

    // Fornecedor — leitura separada, só se a coluna existir (migration 159)
    if (await colunaExiste("alissonerp", "erp_produtos", "fornecedor")) {
      const [fr] = await sql<{ fornecedor: string | null }[]>`
        SELECT fornecedor FROM alissonerp.erp_produtos WHERE produto_id = ${produtoId} LIMIT 1
      `;
      (produto as Record<string, unknown>).fornecedor = fr?.fornecedor ?? null;
    } else {
      (produto as Record<string, unknown>).fornecedor = null;
    }

    // Faixas de markup de pedra (para preview em runtime no drawer)
    const markup_pedras = await sql<{ tamanho_min: string; tamanho_max: string; markup: string }[]>`
      SELECT tamanho_min, tamanho_max, markup
      FROM alissonerp.markup_pedras
      WHERE ativo = true
      ORDER BY tamanho_min ASC
    `;

    return NextResponse.json({ produto, composicao, variacoes, cotacao_ouro, cotacao_dolar, markup_pedras });
  } catch (err) {
    console.error("[GET /api/produtos/[id]]", err);
    return NextResponse.json({ error: "Erro ao buscar produto" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const produtoId = Number(id);
  if (!produtoId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "escrever"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsedBody = ProdutosPatchSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = parsedBody.data as any;

  const fotoBase64 = typeof body.foto_base64 === "string" && body.foto_base64.startsWith("data:")
    ? body.foto_base64
    : null;

  // Campos que vão para public.produtos
  const pubUpdate: Record<string, unknown> = {};
  if (typeof body.tem_pedra_preciosa === "boolean") {
    pubUpdate.tem_pedra_preciosa = body.tem_pedra_preciosa;
  }
  if (typeof body.nome === "string") {
    const n = body.nome.trim();
    if (n) pubUpdate.nome = n;
  }
  if (body.tipo_metal !== undefined) {
    const t = typeof body.tipo_metal === "string" ? body.tipo_metal.trim() : null;
    pubUpdate.tipo_metal = t ? t : null;
  }
  if (body.categoria_geral !== undefined) {
    const c = typeof body.categoria_geral === "string" ? body.categoria_geral.trim() : null;
    pubUpdate.categoria = c ? c : null;
  }
  if (typeof body.situacao === "string" && (body.situacao === "A" || body.situacao === "I")) {
    // Guard: não permite inativar produto com estoque físico > 0.
    // Produtos inativos com estoque ficam invisíveis nos filtros e podem
    // gerar "vazamento" contábil (ouro/pedra não trackeado). Se houver
    // saldo, exige que o estoque seja zerado antes.
    if (body.situacao === "I") {
      const [estoque] = await sql`
        SELECT COALESCE(SUM(saldo_fisico), 0)::int AS saldo
        FROM alissonerp.vw_saldo_estoque_comercial_v2
        WHERE produto_id = ${produtoId}
      `;
      if (Number(estoque?.saldo ?? 0) > 0) {
        return NextResponse.json({
          error: `Não é possível inativar — produto tem ${estoque.saldo} un em estoque. Zere o estoque antes de inativar.`,
        }, { status: 422 });
      }
    }
    pubUpdate.situacao = body.situacao;
  }
  if (body.peso_precificado !== undefined) {
    const n = body.peso_precificado == null ? null : Number(body.peso_precificado);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "peso_precificado inválido" }, { status: 400 });
    pubUpdate.peso_precificado = n;
  }
  if (body.markup !== undefined) {
    const n = body.markup == null ? null : Number(body.markup);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "markup inválido" }, { status: 400 });
    pubUpdate.markup = n;
  }
  if (body.fator !== undefined) {
    const n = body.fator == null ? null : Number(body.fator);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "fator inválido" }, { status: 400 });
    pubUpdate.fator = n;
  }
  if (body.categoria_precificacao !== undefined) {
    const c = typeof body.categoria_precificacao === "string" ? body.categoria_precificacao.trim() : null;
    pubUpdate.categoria_precificacao = c ? c : null;
  }
  if (body.preco_tiny !== undefined) {
    const n = body.preco_tiny == null ? null : Number(body.preco_tiny);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "preco_tiny inválido" }, { status: 400 });
    pubUpdate.preco_tiny = n;
  }
  if (body.preco_pedras !== undefined) {
    const n = body.preco_pedras == null ? null : Number(body.preco_pedras);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "preco_pedras inválido" }, { status: 400 });
    pubUpdate.preco_pedras = n;
  }

  // Campos exclusivos de pedra-produto (alissonerp.produto_pedra_extras)
  let precoCompraUsd: number | null | undefined = undefined;
  if (body.preco_compra_usd !== undefined) {
    const n = body.preco_compra_usd == null ? null : Number(body.preco_compra_usd);
    if (n != null && (isNaN(n) || n < 0)) return NextResponse.json({ error: "preco_compra_usd inválido" }, { status: 400 });
    precoCompraUsd = n;
  }
  let quantidadePedra: number | null | undefined = undefined;
  if (body.quantidade_pedra !== undefined) {
    const n = body.quantidade_pedra == null ? null : Number(body.quantidade_pedra);
    if (n != null && (isNaN(n) || n < 0 || !Number.isInteger(n))) return NextResponse.json({ error: "quantidade_pedra inválida" }, { status: 400 });
    quantidadePedra = n;
  }

  // tipo_item vai para tabela auxiliar
  let tipoItem: "joia" | "insumo" | null | undefined = undefined;
  if (body.tipo_item !== undefined) {
      if (body.tipo_item === null || body.tipo_item === "") tipoItem = null;
      else if (body.tipo_item === "joia" || body.tipo_item === "insumo" || body.tipo_item === "servico") tipoItem = body.tipo_item;
    else return NextResponse.json({ error: "tipo_item inválido" }, { status: 400 });
  }

  // Campos que vão para erp_produtos (upsert)
  const erpUpdate: Record<string, unknown> = {};
  if (typeof body.observacao_erp === "string") {
    erpUpdate.observacao_erp = body.observacao_erp.trim() || null;
  }
  if (body.largura_aro !== undefined) {
    erpUpdate.largura_aro = body.largura_aro != null ? Number(body.largura_aro) : null;
  }
  if (body.altura_aro !== undefined) {
    erpUpdate.altura_aro = body.altura_aro != null ? Number(body.altura_aro) : null;
  }
  if (body.base !== undefined) {
    erpUpdate.base = body.base != null ? Number(body.base) : null;
  }
  if (body.fornecedor !== undefined) {
    erpUpdate.fornecedor = typeof body.fornecedor === "string"
      ? (body.fornecedor.trim() || null)
      : null;
  }

  if (
    Object.keys(pubUpdate).length === 0 &&
    Object.keys(erpUpdate).length === 0 &&
    tipoItem === undefined &&
    !fotoBase64 &&
    precoCompraUsd === undefined &&
    quantidadePedra === undefined &&
    body.controla_estoque === undefined && body.preco_servico === undefined
  ) {
    return NextResponse.json({ error: "Nenhum campo editável informado" }, { status: 400 });
  }

  // ── Verificar permissão de controla_estoque antes de qualquer UPDATE ─────
  if (body.controla_estoque !== undefined) {
    const [permCE] = await sql`
      SELECT pode_escrever FROM alissonerp.role_permissoes
      WHERE role = ${user.role} AND modulo = 'controlar_estoque'
    `;
    if (!permCE?.pode_escrever) {
      return NextResponse.json({ error: "Sem permissão para controlar estoque" }, { status: 403 });
    }
  }

  try {
    // ── public.produtos ────────────────────────────────────────────────────
    if (pubUpdate.tem_pedra_preciosa !== undefined) {
      await sql`
        UPDATE public.produtos
        SET tem_pedra_preciosa = ${pubUpdate.tem_pedra_preciosa as boolean}
        WHERE id_produto = ${produtoId}
      `;
      await recalcularPrecoPedras(produtoId);
    }
    if (pubUpdate.nome !== undefined) {
      await sql`UPDATE public.produtos SET nome = ${pubUpdate.nome as string} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.tipo_metal !== undefined) {
      await sql`UPDATE public.produtos SET tipo_metal = ${pubUpdate.tipo_metal as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.categoria !== undefined) {
      await sql`UPDATE public.produtos SET categoria = ${pubUpdate.categoria as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.situacao !== undefined) {
      await sql`UPDATE public.produtos SET situacao = ${pubUpdate.situacao as string} WHERE id_produto = ${produtoId}`;
    }
    // Precificação — campos de entrada. Trigger em public.produtos recalcula preco_sync.
    if (pubUpdate.peso_precificado !== undefined) {
      await sql`UPDATE public.produtos SET peso_precificado = ${pubUpdate.peso_precificado as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.markup !== undefined) {
      await sql`UPDATE public.produtos SET markup = ${pubUpdate.markup as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.fator !== undefined) {
      await sql`UPDATE public.produtos SET fator = ${pubUpdate.fator as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.categoria_precificacao !== undefined) {
      await sql`UPDATE public.produtos SET categoria_precificacao = ${pubUpdate.categoria_precificacao as string | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.preco_tiny !== undefined) {
      await sql`UPDATE public.produtos SET preco_tiny = ${pubUpdate.preco_tiny as number | null} WHERE id_produto = ${produtoId}`;
    }
    if (pubUpdate.preco_pedras !== undefined) {
      await sql`UPDATE public.produtos SET preco_pedras = ${pubUpdate.preco_pedras as number | null} WHERE id_produto = ${produtoId}`;
    }
    // tipo_item: upsert ou delete em alissonerp.produto_tipo_item
    if (tipoItem !== undefined) {
      if (tipoItem === null) {
        await sql`DELETE FROM alissonerp.produto_tipo_item WHERE produto_id = ${produtoId}`;
      } else {
        await sql`
          INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
          VALUES (${produtoId}, ${tipoItem})
          ON CONFLICT (produto_id) DO UPDATE SET tipo_item = EXCLUDED.tipo_item, updated_at = now()
        `;
      }
    }

    // ── erp_produtos — upsert com campos ERP ──────────────────────────────
    // Silencioso se tabela não existe (migration 063 pendente).
    if (Object.keys(erpUpdate).length > 0) {
      const [tbl] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
        ) AS exists
      `;
      if (!tbl?.exists) {
        console.warn("[PATCH /api/produtos/[id]] erp_produtos não existe — campos ERP ignorados (migration 063 pendente)");
      } else {
      const temColForn = await colunaExiste("alissonerp", "erp_produtos", "fornecedor");
      if (temColForn) {
        await sql`
          INSERT INTO alissonerp.erp_produtos (produto_id, sku, nome,
            largura_aro, altura_aro, base, observacao_erp, fornecedor)
          SELECT
            id_produto, sku, nome,
            ${erpUpdate.largura_aro    !== undefined ? (erpUpdate.largura_aro    as number | null) : null}::numeric,
            ${erpUpdate.altura_aro     !== undefined ? (erpUpdate.altura_aro     as number | null) : null}::numeric,
            ${erpUpdate.base           !== undefined ? (erpUpdate.base           as number | null) : null}::numeric,
            ${erpUpdate.observacao_erp !== undefined ? (erpUpdate.observacao_erp as string | null) : null}::text,
            ${erpUpdate.fornecedor     !== undefined ? (erpUpdate.fornecedor     as string | null) : null}::text
          FROM public.produtos
          WHERE id_produto = ${produtoId}
          ON CONFLICT (produto_id) DO UPDATE SET
            largura_aro    = CASE WHEN ${erpUpdate.largura_aro    !== undefined} THEN EXCLUDED.largura_aro    ELSE erp_produtos.largura_aro    END,
            altura_aro     = CASE WHEN ${erpUpdate.altura_aro     !== undefined} THEN EXCLUDED.altura_aro     ELSE erp_produtos.altura_aro     END,
            base           = CASE WHEN ${erpUpdate.base           !== undefined} THEN EXCLUDED.base           ELSE erp_produtos.base           END,
            observacao_erp = CASE WHEN ${erpUpdate.observacao_erp !== undefined} THEN EXCLUDED.observacao_erp ELSE erp_produtos.observacao_erp END,
            fornecedor     = CASE WHEN ${erpUpdate.fornecedor     !== undefined} THEN EXCLUDED.fornecedor     ELSE erp_produtos.fornecedor     END,
            date_updated   = NOW()
        `;
      } else {
        // Sem coluna fornecedor (migration 159 pendente) — fluxo antigo
        await sql`
          INSERT INTO alissonerp.erp_produtos (produto_id, sku, nome,
            largura_aro, altura_aro, base, observacao_erp)
          SELECT
            id_produto, sku, nome,
            ${erpUpdate.largura_aro    !== undefined ? (erpUpdate.largura_aro    as number | null) : null}::numeric,
            ${erpUpdate.altura_aro     !== undefined ? (erpUpdate.altura_aro     as number | null) : null}::numeric,
            ${erpUpdate.base           !== undefined ? (erpUpdate.base           as number | null) : null}::numeric,
            ${erpUpdate.observacao_erp !== undefined ? (erpUpdate.observacao_erp as string | null) : null}::text
          FROM public.produtos
          WHERE id_produto = ${produtoId}
          ON CONFLICT (produto_id) DO UPDATE SET
            largura_aro    = CASE WHEN ${erpUpdate.largura_aro    !== undefined} THEN EXCLUDED.largura_aro    ELSE erp_produtos.largura_aro    END,
            altura_aro     = CASE WHEN ${erpUpdate.altura_aro     !== undefined} THEN EXCLUDED.altura_aro     ELSE erp_produtos.altura_aro     END,
            base           = CASE WHEN ${erpUpdate.base           !== undefined} THEN EXCLUDED.base           ELSE erp_produtos.base           END,
            observacao_erp = CASE WHEN ${erpUpdate.observacao_erp !== undefined} THEN EXCLUDED.observacao_erp ELSE erp_produtos.observacao_erp END,
            date_updated   = NOW()
        `;
      }
      // Mestre de fornecedores (opcional)
      if (body.fornecedor && typeof body.fornecedor === "string" && body.fornecedor.trim()
          && await tabelaExiste("alissonerp", "fornecedores")) {
        await sql`
          INSERT INTO alissonerp.fornecedores (nome)
          VALUES (${body.fornecedor.trim()})
          ON CONFLICT (nome) DO UPDATE SET ativo = true
        `;
      }
      } // end if tbl?.exists
    }

    // ── Upload de foto (opcional) ────────────────────────────────────────────
    if (fotoBase64) {
      await ensureBucket("produto-fotos");
      const matches = fotoBase64.match(/^data:([^;]+);base64,/);
      const mimeType = matches?.[1] ?? "image/jpeg";
      const ext = mimeType.split("/")[1]?.split("+")[0] ?? "jpg";
      const fileName = `produto-${produtoId}-${Date.now()}.${ext}`;
      const uploaded = await uploadFile("produto-fotos", fileName, fotoBase64, mimeType);
      if (!("error" in uploaded)) {
        await sql`UPDATE public.produtos SET imagem = ${uploaded.url} WHERE id_produto = ${produtoId}`;
      }
    }

    // ── Aplicar curva de precificacao automaticamente ────────────────────────
    // Rodamos quando o usuario mexeu em campos que afetam a curva (peso,
    // categoria_precificacao ou tipo_metal). Se o usuario esta editando markup
    // manualmente (pubUpdate.markup !== undefined), NAO sobrescrevemos.
    const alteraCurva =
      pubUpdate.peso_precificado       !== undefined ||
      pubUpdate.categoria_precificacao !== undefined ||
      pubUpdate.tipo_metal             !== undefined;
    const usuarioDefiniuMarkupManual = pubUpdate.markup !== undefined;

    if (alteraCurva && !usuarioDefiniuMarkupManual) {
      try {
        await aplicarCurvaProduto(produtoId);
      } catch (err) {
        console.warn("[PATCH /api/produtos/[id]] falha ao aplicar curva:", err);
      }
    }

    // ── Aplicar rota padrão (quando categoria mudou + cliente confirmou) ─────
    // O cliente envia `aplicar_rota_padrao: true` quando o usuário confirmou
    // no modal. Sobrescreve a rota existente. Se categoria não mudou ou
    // cliente não pediu, não faz nada — a rota atual é preservada.
    if (body.aplicar_rota_padrao === true && pubUpdate.categoria !== undefined) {
      try {
        const { aplicarRotaPadrao } = await import("@/lib/aplicar-rota-padrao");
        await aplicarRotaPadrao(produtoId, { sobrescrever: true });
      } catch (err) {
        console.warn("[PATCH /api/produtos/[id]] falha ao aplicar rota padrão:", err);
      }
    }

    // ── Preço de serviço (alissonerp.erp_produtos) ────────────────────────────
    if (body.preco_servico !== undefined) {
      const [tblCheck] = await sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos') AS exists`;
      if (tblCheck?.exists) {
        const ps = body.preco_servico == null ? null : Number(body.preco_servico);
        // UPDATE first — evita conflito UNIQUE(sku) quando produto existe mas sem linha em erp_produtos
        const { count } = await sql`
          UPDATE alissonerp.erp_produtos
          SET preco_servico = ${ps}, date_updated = NOW()
          WHERE produto_id = ${produtoId}
        `;
        if (count === 0) {
          // Fallback: cria linha com SKU unico (evita conflito UNIQUE(sku) com SKUs duplicados)
          const [p] = await sql`SELECT sku, nome FROM public.produtos WHERE id_produto = ${produtoId}`;
          if (p) {
            await sql`
              INSERT INTO alissonerp.erp_produtos (produto_id, sku, nome, preco_servico)
              VALUES (${produtoId}, ${`SKU-${produtoId}`}, ${p.nome}, ${ps})
              ON CONFLICT (produto_id) DO UPDATE SET preco_servico = EXCLUDED.preco_servico, date_updated = NOW()
            `;
          }
        }
      }
    }

    // ── Controla estoque (alissonerp.estoque_comercial_config) ────────────────
    if (body.controla_estoque !== undefined) {
      await sql`
        UPDATE alissonerp.estoque_comercial_config
        SET controla_estoque = ${body.controla_estoque}, updated_at = NOW()
        WHERE produto_id = ${produtoId}
      `;
    }

    // ── Propagar campos simples para variações (se for pai) ──────────────────
    const camposAlterados = [
      ...Object.keys(pubUpdate),
      ...Object.keys(erpUpdate),
    ];
    if (camposAlterados.length > 0) {
      try {
        const [tblOk] = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
          ) AS exists
        `;
        if (tblOk?.exists) {
          const [pai] = await sql<{ id: number }[]>`
            SELECT id FROM alissonerp.erp_produtos
            WHERE produto_id = ${produtoId} AND eh_pai = true
            LIMIT 1
          `;
          if (pai) {
            const filhos = await sql<{ produto_id: number }[]>`
              SELECT produto_id FROM alissonerp.erp_produtos
              WHERE parent_id = ${pai.id}
            `;
            if (filhos.length > 0) {
              const filhoIds = filhos.map(f => f.produto_id);

              // public.produtos
              if (pubUpdate.situacao !== undefined) {
                await sql`
                  UPDATE public.produtos SET situacao = ${pubUpdate.situacao as string}
                  WHERE id_produto = ANY(${filhoIds})
                `;
              }
              if (pubUpdate.tipo_metal !== undefined) {
                await sql`
                  UPDATE public.produtos SET tipo_metal = ${pubUpdate.tipo_metal as string | null}
                  WHERE id_produto = ANY(${filhoIds})
                `;
              }
              if (pubUpdate.categoria !== undefined) {
                await sql`
                  UPDATE public.produtos SET categoria = ${pubUpdate.categoria as string | null}
                  WHERE id_produto = ANY(${filhoIds})
                `;
              }
              if (pubUpdate.categoria_precificacao !== undefined) {
                await sql`
                  UPDATE public.produtos SET categoria_precificacao = ${pubUpdate.categoria_precificacao as string | null}
                  WHERE id_produto = ANY(${filhoIds})
                `;
              }
              if (pubUpdate.tem_pedra_preciosa !== undefined) {
                await sql`
                  UPDATE public.produtos SET tem_pedra_preciosa = ${pubUpdate.tem_pedra_preciosa as boolean}
                  WHERE id_produto = ANY(${filhoIds})
                `;
                for (const fid of filhoIds) {
                  await recalcularPrecoPedras(fid);
                }
              }
              if (pubUpdate.fator !== undefined) {
                await sql`
                  UPDATE public.produtos SET fator = ${pubUpdate.fator as number | null}
                  WHERE id_produto = ANY(${filhoIds})
                `;
              }
              if (pubUpdate.peso_precificado !== undefined) {
                await sql`
                  UPDATE public.produtos SET peso_precificado = ${pubUpdate.peso_precificado as number | null}
                  WHERE id_produto = ANY(${filhoIds})
                `;
                for (const fid of filhoIds) {
                  try {
                    await aplicarCurvaProduto(fid);
                  } catch (err) {
                    console.warn("[PATCH /api/produtos/[id]] falha ao recalcular curva p/ filho", fid, err);
                  }
                }
              }

              // erp_produtos (fornecedor / observacao_erp)
              if (erpUpdate.fornecedor !== undefined || erpUpdate.observacao_erp !== undefined) {
                const temForn = await colunaExiste("alissonerp", "erp_produtos", "fornecedor");
                if (temForn) {
                  await sql`
                    UPDATE alissonerp.erp_produtos SET
                      fornecedor     = CASE WHEN ${erpUpdate.fornecedor !== undefined} THEN ${erpUpdate.fornecedor as string | null} ELSE fornecedor END,
                      observacao_erp = CASE WHEN ${erpUpdate.observacao_erp !== undefined} THEN ${erpUpdate.observacao_erp as string | null} ELSE observacao_erp END,
                      date_updated   = NOW()
                    WHERE produto_id = ANY(${filhoIds})
                  `;
                } else {
                  await sql`
                    UPDATE alissonerp.erp_produtos SET
                      observacao_erp = CASE WHEN ${erpUpdate.observacao_erp !== undefined} THEN ${erpUpdate.observacao_erp as string | null} ELSE observacao_erp END,
                      date_updated   = NOW()
                    WHERE produto_id = ANY(${filhoIds})
                  `;
                }
              }

              if (erpUpdate.largura_aro !== undefined || erpUpdate.altura_aro !== undefined || erpUpdate.base !== undefined) {
                await sql`
                  UPDATE alissonerp.erp_produtos SET
                    largura_aro  = CASE WHEN ${erpUpdate.largura_aro !== undefined} THEN ${erpUpdate.largura_aro as number | null} ELSE largura_aro END,
                    altura_aro   = CASE WHEN ${erpUpdate.altura_aro !== undefined} THEN ${erpUpdate.altura_aro as number | null} ELSE altura_aro END,
                    base         = CASE WHEN ${erpUpdate.base !== undefined} THEN ${erpUpdate.base as number | null} ELSE base END,
                    date_updated = NOW()
                  WHERE produto_id = ANY(${filhoIds})
                `;
              }
            }
          }
        }
      } catch (err) {
        console.warn("[PATCH /api/produtos/[id]] falha ao propagar para variações:", err);
      }
    }

    // ── Pedra-produto: preco_compra_usd e quantidade ─────────────────────────
    // Upsert em alissonerp.produto_pedra_extras; se preco_compra_usd mudou e
    // o produto é pedra, recalcula preco_tiny = preco_compra_usd × dolar × markup_faixa.
    if (precoCompraUsd !== undefined || quantidadePedra !== undefined) {
      await sql`
        INSERT INTO alissonerp.produto_pedra_extras (produto_id, preco_compra_usd, quantidade)
        VALUES (
          ${produtoId},
          ${precoCompraUsd ?? null},
          ${quantidadePedra ?? null}
        )
        ON CONFLICT (produto_id) DO UPDATE SET
          preco_compra_usd = CASE WHEN ${precoCompraUsd !== undefined} THEN EXCLUDED.preco_compra_usd ELSE produto_pedra_extras.preco_compra_usd END,
          quantidade       = CASE WHEN ${quantidadePedra !== undefined} THEN EXCLUDED.quantidade       ELSE produto_pedra_extras.quantidade       END,
          updated_at       = NOW()
      `;

      if (precoCompraUsd !== undefined) {
        // Identifica pedra e recalcula preco_tiny
        const [prodCat] = await sql<{ categoria: string | null; peso_precificado: string | null }[]>`
          SELECT categoria, peso_precificado FROM public.produtos WHERE id_produto = ${produtoId} LIMIT 1
        `;
        const ehPedra = (prodCat?.categoria ?? "").toLowerCase().startsWith("pedras");
        if (ehPedra && precoCompraUsd != null) {
          const pesoG = Number(prodCat?.peso_precificado ?? 0);
          const ct = pesoG / 0.2;
          const [params] = await sql<{ dollar: string | null }[]>`SELECT dollar FROM public.parametros LIMIT 1`;
          const cotDolar = Number(params?.dollar ?? 0);
          const [faixa] = await sql<{ markup: string }[]>`
            SELECT markup FROM alissonerp.markup_pedras
            WHERE ${ct} >= tamanho_min AND ${ct} < tamanho_max AND ativo = true
            ORDER BY tamanho_min LIMIT 1
          `;
          let markup = faixa ? Number(faixa.markup) : 0;
          if (!markup) {
            const [fb] = await sql<{ markup: string }[]>`
              SELECT markup FROM alissonerp.markup_pedras
              WHERE ativo = true
              ORDER BY CASE WHEN ${ct} >= tamanho_min THEN tamanho_min END DESC NULLS LAST, tamanho_min ASC
              LIMIT 1
            `;
            markup = Number(fb?.markup ?? 2.0);
          }
          const precoCalc = precoCompraUsd * cotDolar * markup;
          await sql`UPDATE public.produtos SET preco_tiny = ${precoCalc} WHERE id_produto = ${produtoId}`;
        }
      }
    }

    // SELECT de retorno — com ou sem erp_produtos
    const [tblCheck] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'alissonerp' AND table_name = 'erp_produtos'
      ) AS exists
    `;
    const [produto] = tblCheck?.exists
      ? await sql`
          SELECT
            p.id_produto, p.nome, p.sku,
            p.tem_pedra_preciosa, p.preco_pedras, p.preco_total_sync,
            ep.largura_aro, ep.altura_aro, ep.base, ep.observacao_erp
          FROM public.produtos p
          LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
          WHERE p.id_produto = ${produtoId}
        `
      : await sql`
          SELECT
            id_produto, nome, sku,
            tem_pedra_preciosa, preco_pedras, preco_total_sync,
            NULL::numeric AS largura_aro,
            NULL::numeric AS altura_aro,
            NULL::numeric AS base,
            NULL::text    AS observacao_erp
          FROM public.produtos
          WHERE id_produto = ${produtoId}
        `;
    // ── Sincronização com Tiny (síncrona imediata + fila como fallback) ────
    let tinySyncResult: { ok: boolean; erro?: string } | null = null;
    try {
      await sql`
        INSERT INTO alissonerp.tiny_sync_produtos (produto_id, operacao, status)
        VALUES (${produtoId}, 'update', 'pendente')
        ON CONFLICT (produto_id) DO UPDATE SET
          operacao   = CASE WHEN alissonerp.tiny_sync_produtos.operacao = 'create' THEN 'create' ELSE 'update' END,
          status     = 'pendente',
          tentativas = 0,
          updated_at = NOW()
      `;
      const operacao = (await sql`SELECT id_api_produto FROM public.produtos WHERE id_produto = ${produtoId}`)[0]?.id_api_produto
        ? 'update' : 'create';
      tinySyncResult = await syncProdutoToTiny(produtoId, operacao);
    } catch (err) {
      console.warn("[PATCH /api/produtos/[id]] falha ao sincronizar com Tiny:", err);
    }

    // Notifica o site em background (não bloqueia resposta)
    dispararWebhookBackground("produto_atualizado_site", {
      evento: "produto.atualizado",
      produto_id: produtoId,
      nome: produto?.nome,
      situacao: produto?.situacao,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ produto, tiny_sync: tinySyncResult });
  } catch (err) {
    console.error("[PATCH /api/produtos/[id]]", err);
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 });
  }
}
