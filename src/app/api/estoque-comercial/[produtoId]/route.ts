import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

interface Params { params: Promise<{ produtoId: string }> }

// GET /api/estoque-comercial/[produtoId]
// Retorna saldo + últimas movimentações do produto
export async function GET(
  req: NextRequest,
  { params }: Params
) {
  const { produtoId } = await params;
  const id = Number(produtoId);
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const [saldo] = await sql`
    SELECT * FROM alissonerp.vw_estoque_comercial_com_alerta
    WHERE produto_id = ${id}
  `;

  const movimentos = await sql`
    SELECT
      m.id,
      m.tipo,
      m.quantidade,
      m.motivo,
      m.observacao,
      m.referencia_tipo,
      m.referencia_id,
      m.created_at,
      u.email AS criado_por
    FROM alissonerp.movimentacoes_estoque_comercial m
    LEFT JOIN auth.users u ON u.id = m.created_by
    WHERE m.produto_id = ${id}
    ORDER BY m.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json({ saldo: saldo ?? null, movimentos });
}
