import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/[id]/pedras-disponiveis
// Retorna pedras com saldo disponível no PCP: entrada (tipo 3) − retorno (tipo 6)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const pcpId = parseInt(id);
  if (isNaN(pcpId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const rows = await sql`
    WITH apontamentos AS (
      SELECT
        a.insumo_id,
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END)::integer AS qtd_entrada,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END)::integer AS qtd_retorno
      FROM alissonerp.apontamentos_pcp a
      WHERE a.pcp_id = ${pcpId}
      GROUP BY a.insumo_id
    )
    SELECT
      i.id               AS insumo_id,
      i.nome             AS insumo_nome,
      i.sku,
      COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
      COALESCE(a.qtd_entrada, 0)        AS qtd_entrada,
      COALESCE(a.qtd_retorno, 0)        AS qtd_retorno,
      GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
        0
      )                                 AS qtd_disponivel
    FROM apontamentos a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE i.categoria_id = 2
      AND GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
        0
      ) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
