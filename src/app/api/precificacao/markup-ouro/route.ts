/**
 * GET /api/precificacao/markup-ouro
 * Retorna faixas de markup de ouro de public.categoria_precificação (READONLY).
 * Inclui contagem de produtos ativos por categoria.
 *
 * Tabela public.categoria_precificação: IDs 102-110, curvePoints JSONB
 * NÃO modificar — gerenciada pelo sistema legado (Directus).
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isPrecificacaoAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    // Buscar faixas de markup (READONLY — tabela legada)
    // Colunas reais: id, categoryName, range, curvePoints (ARRAY)
    const categorias = await sql`
      SELECT id, "categoryName", "range", "curvePoints"
      FROM public."categoria_precificação"
      ORDER BY id
    `;

    // Contagem de produtos por faixa de peso — mesma lógica do simular/route.ts.
    // categoria_precificacao está vazia em todos os produtos; o vínculo real é pelo peso_precificado
    // comparado com o campo "range" de cada faixa (ex: "0.1g - 0.5g").
    type CatRow = { id: number; categoryName: string; range: string };
    const totalMap: Record<string, number> = {};

    await Promise.all(
      (categorias as unknown as CatRow[]).map(async (cat) => {
        const rangeMatch = String(cat.range ?? "").match(/([\d.]+)g\s*-\s*([\d.]+)g/);
        if (!rangeMatch) return;
        const pesoMin = Number(rangeMatch[1]);
        const pesoMax = Number(rangeMatch[2]);
        const [row] = await sql<{ total: string }[]>`
          SELECT COUNT(*) AS total
          FROM public.produtos
          WHERE COALESCE(peso_precificado, 0) >= ${pesoMin}
            AND COALESCE(peso_precificado, 0) <= ${pesoMax}
            AND situacao = 'A'
            AND COALESCE(peso_precificado, 0) > 0
        `;
        totalMap[cat.categoryName] = Number(row?.total ?? 0);
      }),
    );

    return NextResponse.json({ categorias, totalMap });
  } catch (err) {
    console.error("[GET /api/precificacao/markup-ouro]", err);
    return NextResponse.json({ error: "Erro ao buscar markup ouro" }, { status: 500 });
  }
}
