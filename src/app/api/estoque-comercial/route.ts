import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/estoque-comercial
// Lista todos os produtos com estoque comercial ativo + alertas
export async function GET(_req: NextRequest) {
  const rows = await sql`
    SELECT
      produto_id,
      nome_produto,
      sku,
      categoria,
      saldo,
      estoque_minimo,
      ativo,
      config_id,
      total_movimentacoes,
      alerta
    FROM alissonerp.vw_estoque_comercial_com_alerta
    ORDER BY
      CASE alerta
        WHEN 'zerado'         THEN 0
        WHEN 'abaixo_minimo'  THEN 1
        WHEN 'no_minimo'      THEN 2
        ELSE                       3
      END,
      nome_produto
  `;
  return NextResponse.json(rows);
}
