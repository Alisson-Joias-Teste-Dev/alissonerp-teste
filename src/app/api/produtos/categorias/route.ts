/**
 * GET /api/produtos/categorias
 *
 * Árvore hierárquica de categorias (pai → filhos), aplicando TODOS os filtros
 * ativos (busca, situacao, tipo_metal, tem_pedra, apenas_com_estoque,
 * esconder_insumos, pendencia, sku_prefix). Só NÃO aplica categoria/subcategoria
 * (são o foco da contagem).
 *
 * Padrão: só conta produtos pai ou simples (eh_variacao=false) para bater
 * com a listagem (agrupar=true).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isProdutosAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { buildFiltrosProdutos } from "@/lib/produtos-filtros";

interface Filho { nome: string; total: number }
interface Pai   { pai: string; total: number; filhos: Filho[] }

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = user.user_metadata?.role as string | undefined;
  if (!isProdutosAccess(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const f = buildFiltrosProdutos(req.nextUrl.searchParams, {
      exclude: ["categoria", "tipo_item"],
    });

    const rows = await sql<{ categoria: string | null; produtos: number }[]>`
      SELECT
        NULLIF(TRIM(p.categoria), '') AS categoria,
        COUNT(*)::int                 AS produtos
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE (ep.eh_variacao = false OR ep.id IS NULL)
        ${f.wBusca} ${f.wSkuPrefix} ${f.wPedra} ${f.wSituacao}
        ${f.wTipoMetal} ${f.wEstoque} ${f.wEsconderInsumos} ${f.wPendencia}
      GROUP BY 1
      ORDER BY 1 NULLS LAST
    `;

    const map = new Map<string, Pai>();

    for (const r of rows) {
      const cat = r.categoria ?? "Sem categoria";
      const partes = cat.split("->").map((s) => s.trim()).filter(Boolean);
      const pai = partes[0] || "Sem categoria";
      const filho = partes.slice(1).join(" / ");

      let bucket = map.get(pai);
      if (!bucket) {
        bucket = { pai, total: 0, filhos: [] };
        map.set(pai, bucket);
      }
      bucket.total += r.produtos;
      if (filho) bucket.filhos.push({ nome: filho, total: r.produtos });
    }

    const categorias = Array.from(map.values())
      .map((p) => ({
        ...p,
        filhos: p.filhos.sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({ categorias });
  } catch (err) {
    console.error("[GET /api/produtos/categorias]", err);
    return NextResponse.json({ error: "Erro ao buscar categorias" }, { status: 500 });
  }
}
