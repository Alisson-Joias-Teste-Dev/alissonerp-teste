import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/distribuicao/[id]/pedras-apontadas
// Retorna pedras com saldo disponível: entrada − retorno − já usadas em saídas
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const rows = await sql`
    WITH apontamentos AS (
      SELECT
        a.insumo_id,
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END)::integer AS qtd_entrada,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END)::integer AS qtd_retorno
      FROM alissonerp.apontamentos_distribuicao a
      WHERE a.distribuicao_id = ${distId}
      GROUP BY a.insumo_id
    ),
    usadas AS (
      SELECT sp.insumo_id, SUM(sp.qtd_utilizada)::integer AS qtd_usada
      FROM alissonerp.distribuicao_saida_pedras sp
      JOIN alissonerp.distribuicao_ordens doo ON doo.id = sp.distribuicao_ordem_id
      WHERE doo.distribuicao_id = ${distId}
      GROUP BY sp.insumo_id
    )
    SELECT
      i.id               AS insumo_id,
      i.nome             AS insumo_nome,
      i.sku,
      COALESCE(i.peso_pedra, 0)::float8 AS peso_pedra,
      COALESCE(a.qtd_entrada, 0)        AS qtd_entrada,
      COALESCE(a.qtd_retorno, 0)        AS qtd_retorno,
      COALESCE(u.qtd_usada, 0)          AS qtd_usada,
      GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0) - COALESCE(u.qtd_usada, 0),
        0
      )                                 AS qtd_disponivel
    FROM apontamentos a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    LEFT JOIN usadas u ON u.insumo_id = a.insumo_id
    WHERE i.categoria_id = 2
      AND GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0) - COALESCE(u.qtd_usada, 0),
        0
      ) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
