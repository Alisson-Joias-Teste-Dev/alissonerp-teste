import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/[id]/itens
// Duas fontes:
//   PDV / legado (directus_ordem_id NOT NULL) → directus.itens_ordem_1
//   ERP (directus_ordem_id IS NULL)           → alissonerp.itens_ordem
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = parseInt(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [ordem] = await sql`
    SELECT directus_ordem_id
    FROM alissonerp.ordens
    WHERE id = ${ordemId}
    LIMIT 1
  `;
  if (!ordem) return NextResponse.json({ error: "Ordem não encontrada" }, { status: 404 });

  // PDV/legado: tem directus_ordem_id → buscar em directus.itens_ordem_1
  if (ordem.directus_ordem_id != null) {
    const itens = await sql`
      SELECT
        i.id,
        i.qtd          AS quantidade,
        i.produto_id,
        p.nome         AS produto_nome,
        p.sku          AS produto_sku,
        p.peso_real    AS produto_peso,
        p.imagem_capa  AS produto_imagem
      FROM directus.itens_ordem_1 i
      LEFT JOIN public.produtos p ON p.id_produto = i.produto_id
      WHERE i.ordem_id = ${ordem.directus_ordem_id}
      ORDER BY i.id
    `;
    return NextResponse.json(itens);
  }

  // ERP: sem directus_ordem_id → buscar em alissonerp.itens_ordem
  const itens = await sql`
    SELECT
      i.id,
      i.quantidade,
      i.produto_id,
      i.nome_produto  AS produto_nome,
      i.sku           AS produto_sku,
      i.peso_estimado AS produto_peso,
      NULL            AS produto_imagem
    FROM alissonerp.itens_ordem i
    WHERE i.ordem_id = ${ordemId}
    ORDER BY i.id
  `;
  return NextResponse.json(itens);
}
