import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/distribuicao/ordens-disponiveis
// Ordens elegíveis para distribuição:
//   - TÊM PCP ativo (etapas != 'concluido' e != 'cancelado')
//   - NÃO estão concluídas (status != '3')
//   - NÃO estão em outra distribuição em_andamento
// Query param opcional: ?excluir_dist_id=N
//   → exclui também as ordens JÁ presentes no lote N (para modal "Adicionar Ordens")
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const excluirDistId = searchParams.get("excluir_dist_id");
  const distIdNum = excluirDistId ? parseInt(excluirDistId) : null;

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
      AND o.status::text != '3'
      AND o.id NOT IN (
        SELECT doo.ordens_id
        FROM alissonerp.distribuicao_ordens doo
        JOIN alissonerp.distribuicoes d ON d.id = doo.distribuicao_id
        WHERE d.etapas = 'em_andamento'
      )
      ${distIdNum ? sql`AND o.id NOT IN (
        SELECT ordens_id FROM alissonerp.distribuicao_ordens
        WHERE distribuicao_id = ${distIdNum}
      )` : sql``}
    ORDER BY o.numero_ordem DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
