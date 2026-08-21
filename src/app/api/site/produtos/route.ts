/**
 * GET /api/site/produtos
 *
 * Lista produtos do ERP com o status da integração com o site.
  * Cruza public.produtos × alissonerp.site_produtos.
  * Estoque centralizado em alissonerp.movimentacoes_estoque_comercial.
 *
 * Query params:
 *   busca       — filtra nome/sku
 *   publicados  — "true" só retorna os marcados publicado_no_site
 *
 * Apenas produtos ativos, não-variação (pais + simples), não insumos/matérias.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";
import { internalError } from "@/lib/api-error";

const MSG_MIGRACAO = "Migration 159 pendente. Execute: node scripts/apply_159.mjs";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const busca = sp.get("busca")?.trim() ?? "";
  const apenasPublicados = sp.get("publicados") === "true";
  const apenasComEstoque = sp.get("com_estoque") === "true";

  try {
    if (!(await tabelaExiste("alissonerp", "site_produtos"))) {
      return NextResponse.json({ produtos: [], migracao_pendente: true, mensagem: MSG_MIGRACAO });
    }

    const rows = await sql<{
      produto_id: number; sku: string; nome: string;
      categoria: string | null; preco: number | null; saldo: number;
      publicado_no_site: boolean; status_sync: string;
      wc_product_id: number | null; wc_permalink: string | null;
      ultimo_erro: string | null; ultima_tentativa_at: Date | null;
    }[]>`
      SELECT
        p.id_produto                                    AS produto_id,
        p.sku,
        p.nome,
        p.categoria,
        -- Preço calculado pelo ERP, em ordem de prioridade:
        --   1. preco_sync (trigger de precificação do próprio produto)
        --   2. preco_curva em runtime: peso × cotação_ouro × markup × fator
        --   3. MIN(preco_sync/curva) dos filhos (quando é pai variable)
        --   4. preco_tiny (cadastro manual, último fallback)
        COALESCE(
          NULLIF(p.preco_sync::numeric, 0),
          CASE
            -- PRECO: peso/markup/fator/preco_sync vem de alissonerp.erp_produtos (a verdade,
            -- e a mesma fonte de vw_produto_preco). A copia public.produtos só e preenchida
            -- pelo gatilho no INSERT, entao editar o fator pela ficha nao chegava aqui e o
            -- SITE ficava com o preco antigo (fix 21/08/2026 — caso AJ4829).
            WHEN COALESCE(ep.peso_precificado, p.peso_precificado) > 0
             AND COALESCE(ep.markup, p.markup) > 0
             AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
            THEN ROUND(
              COALESCE(ep.peso_precificado, p.peso_precificado)::numeric
              * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
              * COALESCE(ep.markup, p.markup)::numeric
              * COALESCE(ep.fator, p.fator, 1)::numeric
              / 10
            )::numeric * 10
          END,
          (
            SELECT MIN(
              COALESCE(
                NULLIF(COALESCE(filho_e.preco_sync, fp.preco_sync)::numeric, 0),
                CASE
                  -- Variacao: filho_e JA e a alissonerp.erp_produtos (INNER JOIN abaixo).
                  WHEN COALESCE(filho_e.peso_precificado, fp.peso_precificado) > 0
                   AND COALESCE(filho_e.markup, fp.markup) > 0
                   AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
                  THEN ROUND(
                    COALESCE(filho_e.peso_precificado, fp.peso_precificado)::numeric
                    * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                    * COALESCE(filho_e.markup, fp.markup)::numeric
                    * COALESCE(filho_e.fator, fp.fator, 1)::numeric
                    / 10
                  )::numeric * 10
                END,
                NULLIF(fp.preco_tiny::numeric, 0)
              )
            )
            FROM alissonerp.erp_produtos pai_e
            INNER JOIN alissonerp.erp_produtos filho_e ON filho_e.parent_id = pai_e.id
            INNER JOIN public.produtos fp ON fp.id_produto = filho_e.produto_id
            WHERE pai_e.produto_id = p.id_produto
          ),
          NULLIF(p.preco_tiny::numeric, 0),
          0
        )                                               AS preco,
        -- Saldo consolidado (3 fontes, maior delas):
        --   1. alissonerp.movimentacoes_estoque_comercial do próprio produto
        --   2. SUM de saldo dos filhos (se for pai com variações)
        --   3. vw_estoque_directus_saldo (insumos/pedras)
        GREATEST(
          COALESCE((SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END) FROM alissonerp.movimentacoes_estoque_comercial m WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'), 0)::int,
          COALESCE((
            SELECT SUM(CASE WHEN m_f.tipo = 'entrada' THEN m_f.quantidade ELSE -m_f.quantidade END)::int
            FROM alissonerp.erp_produtos pai_ep
            INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
            INNER JOIN alissonerp.movimentacoes_estoque_comercial m_f ON m_f.produto_id = filho_ep.produto_id
            WHERE pai_ep.produto_id = p.id_produto AND m_f.status = 'efetivado'
          ), 0),
          COALESCE((
            SELECT SUM(v.saldo)::int
            FROM alissonerp.vw_estoque_directus_saldo v
            WHERE v.insumo_sku = p.sku
          ), 0)
        ) AS saldo,
        COALESCE(sp.publicado_no_site, false)           AS publicado_no_site,
        COALESCE(sp.status_sync, 'pendente')            AS status_sync,
        sp.wc_product_id,
        sp.wc_permalink,
        sp.ultimo_erro,
        sp.ultima_tentativa_at
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep   ON ep.produto_id = p.id_produto
      LEFT JOIN alissonerp.site_produtos sp  ON sp.produto_id = p.id_produto
      WHERE p.situacao = 'A'
        AND (ep.eh_variacao = false OR ep.id IS NULL)
        AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Insumos%')
        AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Matérias Primas%')
        AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Mostruário%')
        ${busca
          ? sql`AND (p.nome ILIKE ${"%" + busca + "%"} OR p.sku ILIKE ${"%" + busca + "%"})`
          : sql``}
        ${apenasPublicados
          ? sql`AND sp.publicado_no_site = true`
          : sql``}
        ${apenasComEstoque
          ? sql`AND (
                COALESCE((
                  SELECT SUM(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END)
                  FROM alissonerp.movimentacoes_estoque_comercial m
                  WHERE m.produto_id = p.id_produto AND m.status = 'efetivado'
                ), 0) >= 1
                OR EXISTS (SELECT 1 FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku AND v.saldo >= 1)
                OR (
                  SELECT COALESCE(SUM(CASE WHEN m2.tipo = 'entrada' THEN m2.quantidade ELSE -m2.quantidade END), 0)
                  FROM alissonerp.erp_produtos pai_ep
                  INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
                  INNER JOIN alissonerp.movimentacoes_estoque_comercial m2 ON m2.produto_id = filho_ep.produto_id
                  WHERE pai_ep.produto_id = p.id_produto AND m2.status = 'efetivado'
                ) >= 1
              )`
          : sql``}
      ORDER BY publicado_no_site DESC, p.nome ASC
      LIMIT 500
    `;

    return NextResponse.json({ produtos: rows });
  } catch (err) {
    return internalError("[GET /api/site/produtos]", err, "Erro ao listar produtos");
  }
}
