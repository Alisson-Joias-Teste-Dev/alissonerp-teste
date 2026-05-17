import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/purificacao/liga-tipos
// Retorna mapeamentos liga↔tipo com saldo atual no pote
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const ouro24kLigaId = await getParametroNumber(PARAM.OURO_24K_LIGA_INSUMO_ID);

  const rows = await sql`
    SELECT
      lto.id,
      lto.tipo_18k_insumo_id,
      i18k.nome       AS tipo_18k_nome,
      lto.liga_insumo_id,
      iliga.nome      AS liga_nome,
      lto.teor_default,
      lto.ativo,
      COALESCE(vp24k.saldo_real, 0)::numeric   AS saldo_24k,
      COALESCE(vpliga.saldo_real, 0)::numeric  AS saldo_liga
    FROM alissonerp.liga_tipo_ouro lto
    JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
    JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
    LEFT JOIN alissonerp.vw_detalhe_pote vp24k  ON vp24k.insumo_id  = ${ouro24kLigaId}
    LEFT JOIN alissonerp.vw_detalhe_pote vpliga ON vpliga.insumo_id = lto.liga_insumo_id
    WHERE lto.ativo = true
    ORDER BY lto.id
  `;

  return NextResponse.json(rows);
}
