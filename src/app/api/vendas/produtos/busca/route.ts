import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// ─── GET /api/vendas/produtos/busca?q=&limit= ─────────────────────────────────
// Busca produtos em public.produtos (READONLY)
// Retorna id, sku, nome, preco_venda, peso_precificado e estoque agregado
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 100);

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const produtos = await sql`
    SELECT
      p.id_produto AS id,
      p.sku,
      p.nome,
      p.preco_sync        AS preco_venda,
      p.peso_precificado,
      p.unidade,
      ep.sufixo_variacao,
      ep.numeracao,
      ep.largura_aro
    FROM public.produtos p
    LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto
    WHERE
      p.sku  ILIKE ${'%' + q + '%'}
      OR p.nome ILIKE ${'%' + q + '%'}
    ORDER BY p.nome
    LIMIT ${limit}
  `;

  return NextResponse.json(
    produtos.map((p) => ({
      ...p,
      preco_venda:      p.preco_venda      != null ? Number(p.preco_venda)      : null,
      peso_precificado: p.peso_precificado != null ? Number(p.peso_precificado) : null,
    }))
  );
}
