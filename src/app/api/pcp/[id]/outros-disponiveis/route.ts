import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

// GET /api/pcp/[id]/outros-disponiveis
// Retorna insumos "outros" apontados neste PCP (tipo 8 = Entrada Outros Insumos)
// excluindo metal (cat 1) e pedras (cat 2).
// Usado na saída PCP para descontar peso de silicone, solda, etc. do peso bruto.
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

  const rows = await sql`
    SELECT
      a.insumo_id,
      i.nome                    AS insumo_nome,
      i.categoria_id,
      cat.nome                  AS categoria_nome,
      SUM(a.qtd)::float8        AS peso_total
    FROM alissonerp.apontamentos_pcp a
    JOIN alissonerp.insumos i          ON i.id  = a.insumo_id
    JOIN alissonerp.categorias_insumo cat ON cat.id = i.categoria_id
    WHERE a.pcp_id              = ${pcpId}
      AND a.tipo_apontamento_id = 8
      AND i.categoria_id NOT IN (1, 2)
      AND a.insumo_id IS NOT NULL
    GROUP BY a.insumo_id, i.nome, i.categoria_id, cat.nome
    HAVING SUM(a.qtd) > 0
    ORDER BY i.nome
  `;

  return NextResponse.json(rows);
}
