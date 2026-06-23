import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/orcamento/produtos-pedras?q=
// Lista produtos da categoria "Pedras" (alissonerp.produtos_compat) para orçamento de peça personalizada.
// Filtra por categoria/categoria_precificacao ILIKE '%pedra%'.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const termo = `%${q}%`;

  const produtos = await sql`
    SELECT
      p.id_produto AS id,
      p.sku,
      p.nome,
      p.categoria,
      p.tipo_de_pedra,
      COALESCE(vp.preco_venda, 0)::numeric AS preco,
      p.peso_precificado
    FROM alissonerp.produtos_compat p
    LEFT JOIN alissonerp.vw_pedras_preco vp ON vp.id_produto = p.id_produto
    WHERE p.situacao = 'A'
      AND (
        p.categoria ILIKE '%pedra%'
        OR p.categoria_precificacao ILIKE '%pedra%'
      )
      ${q ? sql`AND (p.nome ILIKE ${termo} OR p.sku ILIKE ${termo} OR p.tipo_de_pedra ILIKE ${termo})` : sql``}
    ORDER BY p.nome
    LIMIT 30
  `;

  return NextResponse.json(
    produtos.map((p) => ({
      id: Number(p.id),
      sku: p.sku,
      nome: p.nome,
      categoria: p.categoria,
      tipo_de_pedra: p.tipo_de_pedra,
      preco: Number(p.preco ?? 0),
      peso_precificado: p.peso_precificado != null ? Number(p.peso_precificado) : null,
    }))
  );
}
