/**
 * GET /api/precificacao/markup-ouro
 * Retorna faixas de markup de ouro de public.categoria_precificação (READONLY).
 * Inclui contagem de produtos ativos por categoria.
 *
 * Tabela public.categoria_precificação: IDs 102-110, curvePoints JSONB
 * NÃO modificar — gerenciada pelo sistema legado (Directus).
 */

import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isPrecificacaoAccess } from "@/lib/roles";
import sql from "@/lib/db";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isPrecificacaoAccess(role)) {
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

    // Contagem de produtos por categoria (keyed por nome, que é como produtos referencia a categoria)
    const contagens = await sql<{ categoria_precificacao: string; total: string }[]>`
      SELECT categoria_precificacao::text, COUNT(*) AS total
      FROM public.produtos
      WHERE categoria_precificacao IS NOT NULL
      GROUP BY categoria_precificacao
    `;

    // totalMap keyed por categoryName (ex: "Leves 1") para bater com produtos.categoria_precificacao
    const totalMap: Record<string, number> = {};
    for (const c of contagens) {
      totalMap[c.categoria_precificacao] = Number(c.total);
    }

    return NextResponse.json({ categorias, totalMap });
  } catch (err) {
    console.error("[GET /api/precificacao/markup-ouro]", err);
    return NextResponse.json({ error: "Erro ao buscar markup ouro" }, { status: 500 });
  }
}
