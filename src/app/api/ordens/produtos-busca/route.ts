import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/produtos-busca?busca=texto
// Autocomplete de produtos para o modal de criação de ordens
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const busca = req.nextUrl.searchParams.get("busca")?.trim() ?? "";
  if (busca.length < 2) return NextResponse.json([]);

  const termo = `%${busca}%`;
  const produtos = await sql`
    SELECT id_produto, nome, sku, peso_precificado, tipo_metal
    FROM alissonerp.produtos_compat
    WHERE situacao = 'A'
      AND (nome ILIKE ${termo} OR sku ILIKE ${termo})
    ORDER BY nome
    LIMIT 30
  `;

  return NextResponse.json(produtos);
}
