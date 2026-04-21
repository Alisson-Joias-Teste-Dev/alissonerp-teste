/**
 * GET /api/site/produtos
 *
 * Lista produtos do ERP com o status da integração com o site.
 * Cruza public.produtos × public.estoque × alissonerp.site_produtos.
 *
 * Query params:
 *   busca       — filtra nome/sku
 *   publicados  — "true" só retorna os marcados publicado_no_site
 *
 * Apenas produtos ativos, não-variação (pais + simples), não insumos/matérias.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { tabelaExiste } from "@/lib/schema-check";

const MSG_MIGRACAO = "Migration 159 pendente. Execute: node scripts/apply_159.mjs";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) {
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
            WHEN p.peso_precificado > 0
             AND p.markup > 0
             AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
            THEN ROUND(
              p.peso_precificado::numeric
              * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
              * p.markup::numeric
              * COALESCE(p.fator::numeric, 1)
              / 10
            )::numeric * 10
          END,
          (
            SELECT MIN(
              COALESCE(
                NULLIF(fp.preco_sync::numeric, 0),
                CASE
                  WHEN fp.peso_precificado > 0
                   AND fp.markup > 0
                   AND (SELECT ouro FROM public.parametros LIMIT 1) > 0
                  THEN ROUND(
                    fp.peso_precificado::numeric
                    * (SELECT ouro FROM public.parametros LIMIT 1)::numeric
                    * fp.markup::numeric
                    * COALESCE(fp.fator::numeric, 1)
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
        --   1. public.estoque do próprio SKU
        --   2. SUM de saldo dos filhos (se for pai com variações)
        --   3. vw_estoque_directus_saldo (insumos/pedras)
        GREATEST(
          COALESCE(e.saldo, 0)::int,
          COALESCE((
            SELECT SUM(e_filho.saldo)::int
            FROM alissonerp.erp_produtos pai_ep
            INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
            INNER JOIN public.produtos filho_prod ON filho_prod.id_produto = filho_ep.produto_id
            INNER JOIN public.estoque e_filho ON e_filho.sku = filho_prod.sku
            WHERE pai_ep.produto_id = p.id_produto
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
      LEFT JOIN public.estoque e             ON e.sku = p.sku
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
                EXISTS (SELECT 1 FROM public.estoque e2 WHERE e2.sku = p.sku AND e2.saldo >= 1)
                OR EXISTS (SELECT 1 FROM alissonerp.vw_estoque_directus_saldo v WHERE v.insumo_sku = p.sku AND v.saldo >= 1)
                OR EXISTS (
                  SELECT 1 FROM alissonerp.erp_produtos pai_ep
                  INNER JOIN alissonerp.erp_produtos filho_ep ON filho_ep.parent_id = pai_ep.id
                  INNER JOIN public.produtos filho_prod ON filho_prod.id_produto = filho_ep.produto_id
                  INNER JOIN public.estoque e3 ON e3.sku = filho_prod.sku
                  WHERE pai_ep.produto_id = p.id_produto AND e3.saldo >= 1
                )
              )`
          : sql``}
      ORDER BY publicado_no_site DESC, p.nome ASC
      LIMIT 500
    `;

    return NextResponse.json({ produtos: rows });
  } catch (err) {
    console.error("[GET /api/site/produtos]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao listar produtos" },
      { status: 500 }
    );
  }
}
