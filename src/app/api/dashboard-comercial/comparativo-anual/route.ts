import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { safeDiv } from "@/lib/dashboard-comercial/utils";
import { internalError } from "@/lib/api-error";

// GET /api/dashboard-comercial/comparativo-anual?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna comparativo ano atual vs ano anterior (faturamento, qtd vendas, ticket).

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? hoje.toISOString().slice(0, 10);

  try {
    // Ano anterior: mesmo range -1 ano
    const fromAnterior = new Date(from + "T00:00:00");
    const toAnterior = new Date(to + "T00:00:00");
    fromAnterior.setFullYear(fromAnterior.getFullYear() - 1);
    toAnterior.setFullYear(toAnterior.getFullYear() - 1);
    const fromAntIso = fromAnterior.toISOString().slice(0, 10);
    const toAntIso = toAnterior.toISOString().slice(0, 10);

    const [atual] = await sql<Array<{ total: string; qtd: string }>>`
      SELECT
        COALESCE(SUM(v.total_venda - v.valor_vale_troca), 0)::text AS total,
        COUNT(*)::text AS qtd
      FROM alissonerp.vw_dash_vendas_todas v
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status = 2
    `;

    // Ano anterior: usa pedidos_parcelas_detalhado (histórico)
    const [anterior] = await sql<Array<{ total: string; qtd: string }>>`
      SELECT
        COALESCE(SUM(ppd.valor_parcela), 0)::text AS total,
        COUNT(DISTINCT ppd.numero_pedido)::text AS qtd
      FROM alissonerp.vw_dash_pedidos_parcelas_detalhado ppd
      WHERE ppd.data_pedido BETWEEN ${fromAntIso}::date AND ${toAntIso}::date
        AND ppd.eh_devolucao = false
        AND COALESCE(ppd.situacao, '') NOT IN ('1') -- exclui cancelados
    `;

    const totalAtual = Number(atual?.total ?? 0);
    const qtdAtual = Number(atual?.qtd ?? 0);
    const totalAnterior = Number(anterior?.total ?? 0);
    const qtdAnterior = Number(anterior?.qtd ?? 0);

    const ticketAtual = safeDiv(totalAtual, qtdAtual);
    const ticketAnterior = safeDiv(totalAnterior, qtdAnterior);

    const resp = {
      faturamento: {
        atual: totalAtual,
        anterior: totalAnterior,
        delta: totalAtual - totalAnterior,
        delta_percentual: safeDiv(totalAtual - totalAnterior, totalAnterior) * 100,
      },
      quantidade_vendas: {
        atual: qtdAtual,
        anterior: qtdAnterior,
        delta: qtdAtual - qtdAnterior,
        delta_percentual: safeDiv(qtdAtual - qtdAnterior, qtdAnterior) * 100,
      },
      ticket_medio: {
        atual: ticketAtual,
        anterior: ticketAnterior,
        delta: ticketAtual - ticketAnterior,
        delta_percentual: safeDiv(ticketAtual - ticketAnterior, ticketAnterior) * 100,
      },
      periodo: { atual: { from, to }, anterior: { from: fromAntIso, to: toAntIso } },
    };

    return NextResponse.json(resp);
  } catch (err) {
    return internalError("[GET /api/dashboard-comercial/comparativo-anual]", err);
  }
}
