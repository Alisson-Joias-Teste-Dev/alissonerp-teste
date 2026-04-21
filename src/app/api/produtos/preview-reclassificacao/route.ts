/**
 * GET /api/produtos/preview-reclassificacao
 * Endpoint TEMPORÁRIO — preview da reclassificação joia vs insumo por preço.
 * Remover após decisão do usuário.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    // Distribuição por faixa de preço (ativos, pais+simples)
    const faixas = await sql`
      WITH base AS (
        SELECT
          p.id_produto, p.sku, p.nome, p.categoria,
          COALESCE(NULLIF(p.preco_sync,'0')::numeric,
                   NULLIF(p.preco_total_sync,'0')::numeric,
                   NULLIF(p.preco_tiny,'0')::numeric,
                   0) AS preco
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        WHERE p.situacao = 'A' AND (ep.eh_variacao = false OR ep.id IS NULL)
      )
      SELECT
        CASE
          WHEN preco = 0         THEN '0-sem preço'
          WHEN preco <  50       THEN 'a) < 50'
          WHEN preco <  100      THEN 'b) 50-100'
          WHEN preco <  300      THEN 'c) 100-300'
          WHEN preco <  1000     THEN 'd) 300-1k'
          WHEN preco <  5000     THEN 'e) 1k-5k'
          ELSE                        'f) 5k+'
        END AS faixa,
        COUNT(*)::int AS total
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;

    // Corte: >=300 joia, <300 insumo. Mostrar categorias atuais dentro de cada lado.
    const porLadoECategoria = await sql`
      WITH base AS (
        SELECT
          p.id_produto, p.categoria,
          COALESCE(NULLIF(p.preco_sync,'0')::numeric,
                   NULLIF(p.preco_total_sync,'0')::numeric,
                   NULLIF(p.preco_tiny,'0')::numeric,
                   0) AS preco
        FROM public.produtos p
        LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
        WHERE p.situacao = 'A' AND (ep.eh_variacao = false OR ep.id IS NULL)
      )
      SELECT
        CASE WHEN preco >= 300 THEN 'JOIA (>=300)' ELSE 'INSUMO (<300)' END AS lado,
        COALESCE(NULLIF(TRIM(categoria),''), '<sem categoria>') AS categoria_atual,
        COUNT(*)::int AS total
      FROM base
      GROUP BY 1, 2
      ORDER BY 1, 3 DESC
    `;

    // Amostras de casos estranhos
    const insumosAlto = await sql`
      SELECT p.sku, p.nome, p.categoria,
             p.preco_tiny, p.preco_sync, p.preco_total_sync
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.situacao='A' AND (ep.eh_variacao = false OR ep.id IS NULL)
        AND p.categoria ILIKE 'Insumos%'
        AND COALESCE(NULLIF(p.preco_sync,'0')::numeric,
                     NULLIF(p.preco_total_sync,'0')::numeric,
                     NULLIF(p.preco_tiny,'0')::numeric, 0) >= 300
      ORDER BY 5 DESC NULLS LAST
      LIMIT 20
    `;

    const joiasBaixo = await sql`
      SELECT p.sku, p.nome, p.categoria,
             p.preco_tiny, p.preco_sync, p.preco_total_sync
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE p.situacao='A' AND (ep.eh_variacao = false OR ep.id IS NULL)
        AND p.categoria NOT ILIKE 'Insumos%'
        AND p.categoria NOT ILIKE 'Mostruário%'
        AND p.categoria NOT ILIKE 'Serviços%'
        AND COALESCE(NULLIF(p.preco_sync,'0')::numeric,
                     NULLIF(p.preco_total_sync,'0')::numeric,
                     NULLIF(p.preco_tiny,'0')::numeric, 0) < 300
      ORDER BY 5 DESC NULLS LAST
      LIMIT 20
    `;

    return NextResponse.json({ faixas, porLadoECategoria, insumosAlto, joiasBaixo });
  } catch (err) {
    console.error("[preview-reclassificacao]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
