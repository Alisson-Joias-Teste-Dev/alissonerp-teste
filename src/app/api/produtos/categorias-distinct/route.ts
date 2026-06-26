/**
 * GET /api/produtos/categorias-distinct
 *
 * Lista crua de categorias distintas em uso por produtos (string).
 * Usado pelo select de categoria nos templates de rota — garante que só
 * apareçam categorias que de fato existem em produtos.
 *
 * Query params:
 *   joias_only=1  →  filtra fora categorias que claramente não são joia
 *                    (insumos, ferramentas, matéria prima, serviços, etc.).
 *                    Útil pra contextos de FABRICAÇÃO onde só faz sentido
 *                    cadastrar rota pra peça acabada.
 */

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// Termos que indicam que a categoria NÃO é joia acabada e portanto não
// precisa de rota de fabricação. Match case-insensitive em qualquer parte
// do nome da categoria.
const TERMOS_NAO_JOIA = [
  "insumo",
  "ferramenta",
  "materia prima",
  "matéria prima",
  "materias primas",
  "matérias primas",
  "equipamento",
  "manutenção",
  "manutencao",
  "serviços",
  "servicos",
  "mostruário",
  "mostruario",
  "promoção",
  "promocao",
  "pedras",
  "copa",
  "brinde",
  "embalagem",
  "estojo",
] as const;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const joiasOnly = req.nextUrl.searchParams.get("joias_only") === "1";

  const rows = await sql<{ categoria: string }[]>`
    SELECT DISTINCT TRIM(categoria) AS categoria
    FROM public.produtos
    WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
    ORDER BY 1 ASC
  `;

  let lista = rows.map((r) => r.categoria);
  if (joiasOnly) {
    lista = lista.filter((c) => {
      const cLower = c.toLowerCase();
      return !TERMOS_NAO_JOIA.some((t) => cLower.includes(t));
    });
  }

  return NextResponse.json(lista);
}
