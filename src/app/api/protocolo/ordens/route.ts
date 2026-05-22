import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  const [, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const direcao = req.nextUrl.searchParams.get("direcao") || "ida";

  if (direcao === "volta") {
    // REGRA: usa view corrigida que inclui ordens regulares (service, fabricação)
    // com PCP concluído + auditoria fábrica aprovada, além de conversao_sku.
    // Migration 271 restaurou a lógica original que a 253 sobrescreveu.
    const rows = await sql`
      SELECT id, numero_ordem, status,
             CASE WHEN tipo_ordem = 'conversao_sku' THEN 'conversao_sku' ELSE 'regular' END AS tipo
      FROM alissonerp.vw_ordens_prontas_volta
      ORDER BY id DESC
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT id, numero_ordem, status::text as status, 'regular' AS tipo
    FROM alissonerp.vw_ordens_prontas_ida
    UNION ALL
    SELECT DISTINCT ON (o.id) o.id, o.numero_ordem, o.status::text as status, 'transferencia_service' AS tipo
    FROM alissonerp.transferencias_ordem t
    JOIN alissonerp.ordens o ON o.id = t.ordem_id
    WHERE t.tipo_transferencia = 'service'
      AND t.protocolo_id IS NULL
      AND o.status::text NOT IN ('cancelado', 'concluido', 'entregue')
    ORDER BY id DESC
  `;

  return NextResponse.json(rows);
}
