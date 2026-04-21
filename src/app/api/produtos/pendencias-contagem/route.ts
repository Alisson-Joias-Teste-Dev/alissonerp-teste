/**
 * GET /api/produtos/pendencias-contagem
 *
 * Retorna contagem de pendências dinamicamente, aplicando todos os filtros
 * ativos (exceto a própria pendência).
 *
 * Estrutura:
 *   { qualquer: N, sem_categoria: N, sem_metal: N, sem_peso: N, sem_preco: N }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { buildFiltrosProdutos } from "@/lib/produtos-filtros";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = user.user_metadata?.role as string | undefined;
  if (!(await temAcessoModulo(role ?? "", "produtos", "ler"))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const f = buildFiltrosProdutos(req.nextUrl.searchParams, {
      exclude: ["pendencia", "tipo_item"],
    });

    const [row] = await sql<{
      qualquer: string; sem_categoria: string; sem_metal: string;
      sem_peso: string; sem_preco: string; total: string;
    }[]>`
      SELECT
        COUNT(*) FILTER (WHERE ${f.wSemCat} OR ${f.wSemMetal} OR ${f.wSemPeso} OR ${f.wSemPreco})::text AS qualquer,
        COUNT(*) FILTER (WHERE ${f.wSemCat})::text   AS sem_categoria,
        COUNT(*) FILTER (WHERE ${f.wSemMetal})::text AS sem_metal,
        COUNT(*) FILTER (WHERE ${f.wSemPeso})::text  AS sem_peso,
        COUNT(*) FILTER (WHERE ${f.wSemPreco})::text AS sem_preco,
        COUNT(*)::text                                AS total
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE (ep.eh_variacao = false OR ep.id IS NULL)
        ${f.wBusca} ${f.wSkuPrefix} ${f.wPedra} ${f.wSituacao}
        ${f.wCategoria} ${f.wTipoMetal} ${f.wEstoque} ${f.wEsconderInsumos}
    `;

    return NextResponse.json({
      qualquer: Number(row?.qualquer ?? 0),
      sem_categoria: Number(row?.sem_categoria ?? 0),
      sem_metal: Number(row?.sem_metal ?? 0),
      sem_peso: Number(row?.sem_peso ?? 0),
      sem_preco: Number(row?.sem_preco ?? 0),
      total: Number(row?.total ?? 0),
    });
  } catch (err) {
    console.error("[GET /api/produtos/pendencias-contagem]", err);
    return NextResponse.json({ error: "Erro ao buscar contagens" }, { status: 500 });
  }
}
