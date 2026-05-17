import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

// GET /api/estoque-comercial/inventario/[id] — detalhe do inventário + itens
export async function GET(
  req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const invId = Number(id);

  const [inventario] = await sql`
    SELECT
      i.id, i.local_estoque_id, le.nome AS local_nome,
      i.status, i.obs, i.categoria, i.data_abertura, i.data_conclusao,
      uc.email AS criado_por_email,
      uf.email AS concluido_por_email
    FROM alissonerp.inventarios_comercial i

    LEFT JOIN alissonerp.locais_estoque le ON le.id = i.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = i.created_by
    LEFT JOIN auth.users uf ON uf.id = i.concluido_por
    WHERE i.id = ${invId}
  `;
  if (!inventario) return NextResponse.json({ error: "Inventário não encontrado" }, { status: 404 });

  const url = new URL(req.url);
  const soDivergentes = url.searchParams.get("divergentes") === "true";

  const itens = await sql`
    SELECT
      ii.id, ii.produto_id, ii.quantidade_sistema, ii.quantidade_contada, ii.diferenca,
      ii.conferido, ii.contado_em, ii.movimento_ajuste_id,
      p.nome AS nome_produto, p.sku,
      uc.email AS contado_por_email
    FROM alissonerp.itens_inventario_comercial ii
    LEFT JOIN public.produtos p ON p.id_produto = ii.produto_id
    LEFT JOIN auth.users uc ON uc.id = ii.contado_por
    WHERE ii.inventario_id = ${invId}
      ${soDivergentes ? sql`AND ii.diferenca != 0` : sql``}
    ORDER BY
      CASE WHEN ii.quantidade_contada IS NULL THEN 0 ELSE 1 END,
      p.nome
  `;

  // Filtra leituras diretamente pelo inventario_id (vínculo direto, sem ambiguidade)
  const leituras = await sql`
    SELECT epc, evento, lido_em, operador::text AS operador
    FROM alissonerp.joias_leituras
    WHERE inventario_id = ${invId}
    ORDER BY lido_em DESC
    LIMIT 200
  `;

  return NextResponse.json({ inventario, itens, leituras });
}
