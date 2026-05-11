/**
 * GET /api/produtos/categorias-distinct
 *
 * Lista crua de categorias distintas em uso por produtos (string).
 * Usado pelo select de categoria nos templates de rota — garante que só
 * apareçam categorias que de fato existem em produtos.
 */

import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await sql<{ categoria: string }[]>`
    SELECT DISTINCT TRIM(categoria) AS categoria
    FROM public.produtos
    WHERE categoria IS NOT NULL AND TRIM(categoria) <> ''
    ORDER BY 1 ASC
  `;
  return NextResponse.json(rows.map((r) => r.categoria));
}
