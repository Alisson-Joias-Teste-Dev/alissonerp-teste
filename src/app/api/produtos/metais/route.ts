/**
 * GET /api/produtos/metais
 *
 * Retorna distintos tipo_metal + contagem, **aplicando os demais filtros
 * ativos** (situacao, busca, categoria, apenas_com_estoque, esconder_insumos,
 * pendencia, tem_pedra, sku_prefix). Só NÃO aplica tipo_metal (foco).
 *
 * Isso garante que o contador bate com a listagem real.
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";
import { buildFiltrosProdutos } from "@/lib/produtos-filtros";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const f = buildFiltrosProdutos(req.nextUrl.searchParams, {
      exclude: ["tipo_metal", "tipo_item"],
    });

    const rows = await sql<{ tipo_metal: string | null; total: number }[]>`
      SELECT
        NULLIF(TRIM(COALESCE(ep.tipo_metal, p.tipo_metal)), '') AS tipo_metal,
        COUNT(*)::int                  AS total
      FROM public.produtos p
      LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
      WHERE (ep.eh_variacao = false OR ep.id IS NULL)
        -- Pedras não têm tipo_metal (não são feitas de metal). Excluídas
        -- do bucket "Sem Metal" pra não poluir a contagem.
        AND (COALESCE(ep.categoria, p.categoria) IS NULL OR COALESCE(ep.categoria, p.categoria) NOT ILIKE 'Pedras%')
        ${f.wBusca} ${f.wSkuPrefix} ${f.wPedra} ${f.wSituacao}
        ${f.wCategoria} ${f.wEstoque} ${f.wEsconderInsumos} ${f.wPendencia}
      GROUP BY 1
      ORDER BY 2 DESC
    `;

    return NextResponse.json({ metais: rows });
  } catch (err) {
    console.error("[GET /api/produtos/metais]", err);
    return NextResponse.json({ error: "Erro ao buscar metais" }, { status: 500 });
  }
}
