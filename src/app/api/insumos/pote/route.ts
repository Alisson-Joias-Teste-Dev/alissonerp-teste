import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { normalizeRow } from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/insumos/pote
// Sem parâmetros: saldo total por categoria (vw_saldo_pote)
// Com ?local_id=N: saldo por local (vw_saldo_por_local), filtrando por local_estoque_id
// Sprint 3: inclui saldo_ct para pedras
export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const localIdParam = req.nextUrl.searchParams.get("local_id");

  if (localIdParam) {
    const localId = parseInt(localIdParam);
    if (isNaN(localId)) {
      return NextResponse.json({ error: "local_id inválido" }, { status: 400 });
    }

    // Retorna saldo por insumo para o local especificado
    const rows = await sql`
      SELECT *
      FROM alissonerp.vw_saldo_por_local
      WHERE local_estoque_id = ${localId}
        AND saldo > 0
      ORDER BY categoria_nome, insumo_nome
    `;

    const numericFields = ["saldo", "saldo_ct", "peso_pedra_ct"];
    return NextResponse.json(rows.map((r) => normalizeRow(r as Record<string, unknown>, numericFields)));
  }

  // Saldo total por categoria (vw_saldo_pote)
  const rows = await sql`
    SELECT * FROM alissonerp.vw_saldo_pote ORDER BY categoria_nome
  `;
  const numericFields = ["saldo_total"];
  return NextResponse.json(rows.map((r) => normalizeRow(r as Record<string, unknown>, numericFields)));
}
