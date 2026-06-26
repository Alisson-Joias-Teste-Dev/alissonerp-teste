import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/rfid/categorias-disponiveis
 *
 * Retorna lista de categorias BASE (prefixo antes de " -> ") que possuem
 * produtos ativos com estoque >= 1, ordenadas por contagem desc.
 *
 * Usado pela tela /rfid/cadastro para montar os chips de filtro.
 *
 * Response 200:
 *   {
 *     total_geral: number,
 *     categorias: Array<{ base: string, total: number }>
 *   }
 *
 * Errors:
 *   401 nao autenticado
 *   500 erro interno
 */
export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    // Query 1: total geral (produtos ativos com estoque)
    const [totalRow] = await sql`
      SELECT COUNT(*)::INT AS total
      FROM public.produtos
      WHERE qtd_estoque >= 1
        AND situacao = 'A'
    `;

    // Query 2: contagem por categoria base
    // SPLIT_PART(categoria, ' -> ', 1) extrai o prefixo hierarquico
    // Ex: "Anel -> Feminino" -> "Anel" | "Corrente" -> "Corrente"
    const rows = await sql`
      SELECT
        SPLIT_PART(categoria, ' -> ', 1) AS base,
        COUNT(*)::INT AS total
      FROM public.produtos
      WHERE qtd_estoque >= 1
        AND situacao = 'A'
        AND categoria IS NOT NULL
        AND TRIM(categoria) <> ''
      GROUP BY SPLIT_PART(categoria, ' -> ', 1)
      HAVING COUNT(*) >= 1
      ORDER BY total DESC, base ASC
    `;

    return NextResponse.json({
      total_geral: Number(totalRow?.total ?? 0),
      categorias: rows.map((r) => ({
        base:  r.base as string,
        total: Number(r.total),
      })),
    });
  } catch (err) {
    console.error("[GET /api/rfid/categorias-disponiveis] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
