import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isVendasFullAccess, getUserVendedorId } from "@/lib/auth-vendas";

interface Params { params: Promise<{ clienteId: string }> }

// GET /api/vendas/por-cliente/[clienteId]
// Retorna vendas de um cliente (para seleção na ordem de garantia).
// Onda 1D: rota estava SEM AUTH NENHUMA. Adicionado authOr401 +
//          filtro de ownership pra consultora (so ve vendas proprias).
export async function GET(
  req: NextRequest,
  { params }: Params
) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const { clienteId } = await params;
  const id = Number(clienteId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Trava de rascunho: este endpoint alimenta os 3 modais de nova ordem
  // (seleção de venda do cliente). Rascunho é orçamento não confirmado —
  // se aparecer aqui, a consultora consegue abrir ordem a partir de um
  // orçamento que nunca foi firmado. Filtra em ambas as queries abaixo.
  const vendas = isVendasFullAccess(user.role)
    ? await sql`
        SELECT
          v.id,
          v.numero_venda,
          v.data_venda,
          v.total_venda,
          v.situacao,
          COALESCE(v.qtd_itens, 0)   AS qtd_itens,
          COALESCE(v.total_pago, 0)  AS total_pago
        FROM alissonerp.vw_vendas_erp_completa v
        WHERE v.cliente_id = ${id} AND v.situacao <> 'rascunho'
        ORDER BY v.data_venda DESC
        LIMIT 50
      `
    : await (async () => {
        const vid = await getUserVendedorId(user.id);
        return sql`
          SELECT
            v.id,
            v.numero_venda,
            v.data_venda,
            v.total_venda,
            v.situacao,
            COALESCE(v.qtd_itens, 0)   AS qtd_itens,
            COALESCE(v.total_pago, 0)  AS total_pago
          FROM alissonerp.vw_vendas_erp_completa v
          WHERE v.cliente_id = ${id} AND v.vendedor_id = ${vid} AND v.situacao <> 'rascunho'
          ORDER BY v.data_venda DESC
          LIMIT 50
        `;
      })();

  return NextResponse.json(
    vendas.map(v => ({
      ...v,
      total_venda: Number(v.total_venda),
      total_pago:  Number(v.total_pago),
      qtd_itens:   Number(v.qtd_itens),
    }))
  );
}
