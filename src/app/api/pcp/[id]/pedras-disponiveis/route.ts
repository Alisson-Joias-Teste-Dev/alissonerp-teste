import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/[id]/pedras-disponiveis
// Retorna pedras com saldo disponível no PCP: entrada (tipo 3) − retorno (tipo 6)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { id } = await params;
  const pcpId = parseInt(id);
  if (isNaN(pcpId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const pedraCategoriaId = await getParametroNumber(PARAM.PEDRA_CATEGORIA_ID);

  const rows = await sql`
    WITH apontamentos AS (
      SELECT
        a.insumo_id,
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END)::integer  AS qtd_entrada,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END)::integer  AS qtd_retorno,
        -- Sprint 3: saldo em ct
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN COALESCE(a.peso_ct, 0) ELSE 0 END) AS ct_entrada,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN COALESCE(a.peso_ct, 0) ELSE 0 END) AS ct_retorno
      FROM alissonerp.apontamentos_pcp a
      WHERE a.pcp_id = ${pcpId}
      GROUP BY a.insumo_id
    )
    SELECT
      i.id                               AS insumo_id,
      i.nome                             AS insumo_nome,
      i.sku,
      COALESCE(i.peso_pedra, 0)::float8  AS peso_pedra,
      COALESCE(i.peso_pedra_ct, 0)::float8 AS peso_pedra_ct,
      COALESCE(a.qtd_entrada, 0)         AS qtd_entrada,
      COALESCE(a.qtd_retorno, 0)         AS qtd_retorno,
      GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
        0
      )                                  AS qtd_disponivel,
      -- Sprint 3: saldo em ct (fallback: qtd_disponivel × peso_pedra_ct)
      GREATEST(
        CASE
          WHEN (COALESCE(a.ct_entrada, 0) + COALESCE(a.ct_retorno, 0)) > 0
            THEN COALESCE(a.ct_entrada, 0) - COALESCE(a.ct_retorno, 0)
          ELSE
            GREATEST(
              COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
              0
            ) * COALESCE(i.peso_pedra_ct, 0)
        END,
        0
      )::numeric(10,4)                   AS saldo_ct,
      -- saldo_un = qtd_disponivel (alias para clareza)
      GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
        0
      )                                  AS saldo_un
    FROM apontamentos a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    WHERE i.categoria_id = ${pedraCategoriaId}
      AND GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0),
        0
      ) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
