import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// GET /api/dashboard/fabrica/movimentacoes?inicio=YYYY-MM-DD&fim=YYYY-MM-DD&page=1&pageSize=20
//
// Retorna movimentações de estoque (ouro cat=1) no período, paginadas
// JOIN: insumos (nome), depositos (nome)
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const hoje = new Date();
  const menos30 = new Date(hoje);
  menos30.setDate(hoje.getDate() - 30);

  const inicio = params.get("inicio") ?? menos30.toISOString().split("T")[0];
  const fim    = params.get("fim")    ?? hoje.toISOString().split("T")[0];
  const page   = Math.max(1, parseInt(params.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get("pageSize") ?? "20", 10)));
  const offset = (page - 1) * pageSize;

  const inicioTs = `${inicio} 00:00:00`;
  const fimTs    = `${fim} 23:59:59`;

  const metalCategoriaId = await getParametroNumber(PARAM.METAL_CATEGORIA_ID);

  // Total para paginação
  const [{ total }] = await sql`
    SELECT COUNT(*)::int AS total
    FROM alissonerp.movimentacoes_estoque me
    JOIN alissonerp.insumos i ON i.id = me.insumo_id
    WHERE i.categoria_id = ${metalCategoriaId}
      AND me.data_hora BETWEEN ${inicioTs}::timestamptz AND ${fimTs}::timestamptz
  `;

  // Movimentações paginadas
  const rows = await sql`
    SELECT
      me.id,
      me.data_hora,
      me.entrada,
      me.saida,
      me.marcador,
      me.obs,
      me.insumo_id,
      i.nome          AS insumo_nome,
      me.deposito_id,
      d.nome          AS deposito_nome
    FROM alissonerp.movimentacoes_estoque me
    JOIN alissonerp.insumos   i ON i.id = me.insumo_id
    JOIN alissonerp.depositos d ON d.id = me.deposito_id
    WHERE i.categoria_id = ${metalCategoriaId}
      AND me.data_hora BETWEEN ${inicioTs}::timestamptz AND ${fimTs}::timestamptz
    ORDER BY me.data_hora DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `;

  return NextResponse.json({
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    rows,
  });
}
