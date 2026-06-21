import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/financeiro/cofre-ouro/upgrades
// Lista upgrades de venda que entraram no Caixa de Ouro e aguardam baixa.
export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  /**
   * REGRA DE NEGÓCIO: upgrade aprovado entra no cofre pelo peso bruto recebido.
   * O QUE: expõe cada item de upgrade com cofre_registrado=true para a tela de baixa.
   * POR QUE: upgrade não é forma de pagamento, então não aparece em caixaList; precisa
   * ser listado por item de venda para manter origem_id = item_venda_id.
   * IMPACTO SE ALTERADO: a baixa pode perder rastreabilidade da venda/consultora ou
   * deixar ouro físico pendente invisível na operação do cofre.
   */
  const rows = await sql`
    SELECT
      iuv.item_venda_id AS id,
      ve.id AS venda_id,
      ve.numero_venda,
      ve.vendedor_nome,
      iuv.peso_gramas,
      iuv.valor_por_grama,
      (iuv.peso_gramas * iuv.valor_por_grama) AS valor_total,
      ive.created_at,
      ve.data_venda
    FROM alissonerp.itens_venda_upgrade iuv
    JOIN alissonerp.itens_venda_erp ive ON ive.id = iuv.item_venda_id
    JOIN alissonerp.vw_vendas_erp_completa ve ON ve.id = ive.venda_id
    WHERE iuv.cofre_registrado = true
      AND ve.situacao IN ('aprovado', 'em_rota', 'entregue', 'concluido', 'virou_credito')
    ORDER BY ve.data_venda DESC NULLS LAST, ive.created_at DESC, iuv.item_venda_id DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}
