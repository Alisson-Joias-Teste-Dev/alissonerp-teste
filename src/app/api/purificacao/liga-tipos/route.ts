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

  const ouro24kLigaId  = await getParametroNumber(PARAM.OURO_24K_LIGA_INSUMO_ID);
  const almoxarifadoId = await getParametroNumber(PARAM.ALMOXARIFADO_DEPOSITO_ID);

  // REGRA DE NEGÓCIO (§3): saldo do Ouro 24k e da liga vem do POTE = depósito ID=1
  // (Almoxarifado Central), agregado por SUM(saldo) em vw_saldo_estoque. NÃO usar o total
  // global (vw_detalhe_pote soma operadores e distorce o disponível do pote).
  const rows = await sql`
    SELECT
      lto.id,
      lto.tipo_18k_insumo_id,
      i18k.nome       AS tipo_18k_nome,
      lto.liga_insumo_id,
      iliga.nome      AS liga_nome,
      lto.teor_default,
      lto.ativo,
      COALESCE((
        SELECT SUM(saldo) FROM alissonerp.vw_saldo_estoque
        WHERE insumo_id = ${ouro24kLigaId} AND deposito_id = ${almoxarifadoId}
      ), 0)::numeric AS saldo_24k,
      COALESCE((
        SELECT SUM(saldo) FROM alissonerp.vw_saldo_estoque
        WHERE insumo_id = lto.liga_insumo_id AND deposito_id = ${almoxarifadoId}
      ), 0)::numeric AS saldo_liga
    FROM alissonerp.liga_tipo_ouro lto
    JOIN alissonerp.insumos i18k  ON i18k.id  = lto.tipo_18k_insumo_id
    JOIN alissonerp.insumos iliga ON iliga.id = lto.liga_insumo_id
    WHERE lto.ativo = true
    ORDER BY lto.id
  `;

  return NextResponse.json(rows);
}
