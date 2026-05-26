import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// REGRA DE NEGOCIO:
// - O que faz: fornece busca rapida de produtos para compor itens de compra comercial.
// - Por que: a compra comercial opera em produto acabado, nao em insumo.
// - Impacto se alterado/removido: usuario nao consegue adicionar itens por produto.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const rows = await sql`
    SELECT p.id_produto, p.nome, p.sku, p.fator, p.peso_precificado
    FROM public.produtos p
    WHERE p.nome IS NOT NULL
      AND (${q}::text = '' OR p.nome ILIKE ${`%${q}%`} OR p.sku ILIKE ${`%${q}%`})
    ORDER BY p.nome
    LIMIT 50
  `;

  return NextResponse.json(rows);
}
