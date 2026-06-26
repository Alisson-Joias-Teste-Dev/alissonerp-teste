import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// REGRA DE NEGOCIO:
// - O que faz: retorna detalhe de uma compra comercial por ID.
// - Por que: painel de detalhe precisa de dados consistentes para operacao e auditoria.
// - Impacto se alterado/removido: detalhe da compra pode quebrar e ocultar informacoes criticas.

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const { id } = await params;
  const compraId = parseInt(id);

  const [row] = await sql`
    SELECT c.*, ct.nome AS fornecedor_nome, le.nome AS local_nome, u.nome AS recebido_por_nome
    FROM alissonerp.compras_comercial c
    LEFT JOIN public.contatos ct ON ct.id_contato = c.fornecedor_id
    LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_estoque_id
    LEFT JOIN alissonerp.usuarios u ON u.id = c.recebido_por
    WHERE c.id = ${compraId}
    LIMIT 1
  `;

  if (!row) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  return NextResponse.json(normalizeRow(row as Record<string, unknown>, ["total", "total_pecas", "peso_total_g", "valor_total_lote", "valor_grama", "ia_peso_balanca", "qtd_parcelas", "local_estoque_id", "fornecedor_id"]));
}
