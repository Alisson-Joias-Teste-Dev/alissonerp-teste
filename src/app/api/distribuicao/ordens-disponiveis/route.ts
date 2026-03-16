import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/distribuicao/ordens-disponiveis
// Ordens elegíveis para nova distribuição:
//   - TÊM PCP ativo (etapas != 'concluido' e != 'cancelado')
//   - NÃO estão em outra distribuição em_andamento
export async function GET() {
  const rows = await sql`
    SELECT
      o.id,
      o.numero_ordem,
      o.tipo_ordem::text,
      o.peso_metal_negociado,
      c.nome AS cliente_nome,
      p.etapas::text AS pcp_etapa,
      p.id AS pcp_id
    FROM alissonerp.pcp p
    JOIN alissonerp.ordens o ON o.id = p.ordem_id
    LEFT JOIN public.contatos c ON c.id_contato = o.cliente_id
    WHERE p.etapas NOT IN ('concluido', 'cancelado')
      AND o.id NOT IN (
        SELECT doo.ordens_id
        FROM alissonerp.distribuicao_ordens doo
        JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
        WHERE d.etapas = 'em_andamento'
      )
    ORDER BY o.numero_ordem DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
