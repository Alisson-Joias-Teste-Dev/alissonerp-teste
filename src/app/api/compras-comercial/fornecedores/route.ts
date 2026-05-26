import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";

// REGRA DE NEGOCIO:
// - O que faz: retorna fornecedores para o seletor da compra comercial.
// - Por que: manter origem de dados unica (contatos) para compras de produto.
// - Impacto se alterado/removido: criacao de compra perde selecao padronizada de fornecedor.
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const rows = await sql`
    SELECT id_contato, nome
    FROM public.contatos
    WHERE nome IS NOT NULL
      AND (${q}::text = '' OR nome ILIKE ${`%${q}%`})
    ORDER BY nome
    LIMIT 30
  `;
  return NextResponse.json(rows);
}
