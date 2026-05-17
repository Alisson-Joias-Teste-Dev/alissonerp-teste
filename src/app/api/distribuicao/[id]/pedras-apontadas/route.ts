import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { getParametroNumber, PARAM } from "@/lib/parametros";

// GET /api/distribuicao/[id]/pedras-apontadas
// Retorna pedras com saldo disponível: entrada − retorno − já usadas em saídas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role) && !["pcp", "ourives"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const distId = parseInt(id);
  if (isNaN(distId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const pedraCategoriaId = await getParametroNumber(PARAM.PEDRA_CATEGORIA_ID);

  const rows = await sql`
    WITH apontamentos AS (
      SELECT
        a.insumo_id,
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN a.qtd ELSE 0 END)::integer                   AS qtd_entrada,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN a.qtd ELSE 0 END)::integer                   AS qtd_retorno,
        -- Sprint 3: saldo em ct (fallback para 0 se colunas ainda não preenchidas)
        SUM(CASE WHEN a.tipo_apontamento_id = 3 THEN COALESCE(a.peso_ct, 0) ELSE 0 END)           AS entrada_ct,
        SUM(CASE WHEN a.tipo_apontamento_id = 6 THEN COALESCE(a.peso_ct, 0) ELSE 0 END)           AS retorno_ct
      FROM alissonerp.apontamentos_distribuicao a
      WHERE a.distribuicao_id = ${distId}
      GROUP BY a.insumo_id
    ),
    usadas AS (
      SELECT sp.insumo_id,
             SUM(sp.qtd_utilizada)::integer           AS qtd_usada,
             SUM(COALESCE(sp.peso_ct_utilizado, 0))   AS usada_ct
      FROM alissonerp.distribuicao_saida_pedras sp
      JOIN alissonerp.distribuicao_ordens doo ON doo.id = sp.distribuicao_ordem_id
      WHERE doo.distribuicao_id = ${distId}
      GROUP BY sp.insumo_id
    )
    SELECT
      i.id                                  AS insumo_id,
      i.nome                                AS insumo_nome,
      i.sku,
      COALESCE(i.peso_pedra, 0)::float8     AS peso_pedra,
      COALESCE(i.peso_pedra_ct, 0)::float8  AS peso_pedra_ct,
      COALESCE(a.qtd_entrada, 0)            AS qtd_entrada,
      COALESCE(a.qtd_retorno, 0)            AS qtd_retorno,
      COALESCE(u.qtd_usada, 0)              AS qtd_usada,
      GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0) - COALESCE(u.qtd_usada, 0),
        0
      )                                     AS qtd_disponivel,
      -- Sprint 3: saldo em ct
      -- Se ct foi gravado nos apontamentos → usar direto; caso contrário, calcular via qtd × peso_pedra_ct
      GREATEST(
        CASE
          WHEN (COALESCE(a.entrada_ct, 0) + COALESCE(a.retorno_ct, 0) + COALESCE(u.usada_ct, 0)) > 0
            THEN COALESCE(a.entrada_ct, 0) - COALESCE(a.retorno_ct, 0) - COALESCE(u.usada_ct, 0)
          ELSE
            GREATEST(
              COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0) - COALESCE(u.qtd_usada, 0),
              0
            ) * COALESCE(i.peso_pedra_ct, 0)
        END,
        0
      )::numeric(10,4)                      AS saldo_ct
    FROM apontamentos a
    JOIN alissonerp.insumos i ON i.id = a.insumo_id
    LEFT JOIN usadas u ON u.insumo_id = a.insumo_id
    WHERE i.categoria_id = ${pedraCategoriaId}
      AND GREATEST(
        COALESCE(a.qtd_entrada, 0) - COALESCE(a.qtd_retorno, 0) - COALESCE(u.qtd_usada, 0),
        0
      ) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
