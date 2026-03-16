import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/insumos-disponiveis
// Params:
//   deposito_id          (default 1)
//   categoria_id         filtro exato por categoria (default 1)
//   excluir_categorias   CSV de IDs de categoria a EXCLUIR, ex: "1,2"
//                        Quando presente, ignora categoria_id e usa NOT IN
export async function GET(req: NextRequest) {
  const depositoId = parseInt(req.nextUrl.searchParams.get("deposito_id") ?? "1");
  const excluirParam = req.nextUrl.searchParams.get("excluir_categorias");

  if (excluirParam) {
    const excluirIds = excluirParam.split(",").map(Number).filter(Boolean);
    const rows = await sql`
      SELECT
        i.id,
        i.nome,
        i.sku,
        i.unidade,
        i.peso_pedra,
        COALESCE(se.saldo, 0) AS saldo_disponivel
      FROM alissonerp.insumos i
      LEFT JOIN alissonerp.vw_saldo_estoque se
        ON se.insumo_id = i.id AND se.deposito_id = ${depositoId}
      WHERE NOT (i.categoria_id = ANY(${excluirIds}))
        AND i.ativo = true
        AND COALESCE(se.saldo, 0) > 0
      ORDER BY i.nome
    `;
    return NextResponse.json(rows);
  }

  const categoriaId = parseInt(req.nextUrl.searchParams.get("categoria_id") ?? "1");
  const rows = await sql`
    SELECT
      i.id,
      i.nome,
      i.sku,
      i.unidade,
      i.peso_pedra,
      COALESCE(se.saldo, 0) AS saldo_disponivel
    FROM alissonerp.insumos i
    LEFT JOIN alissonerp.vw_saldo_estoque se
      ON se.insumo_id = i.id AND se.deposito_id = ${depositoId}
    WHERE i.categoria_id = ${categoriaId}
      AND i.ativo = true
      AND COALESCE(se.saldo, 0) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
