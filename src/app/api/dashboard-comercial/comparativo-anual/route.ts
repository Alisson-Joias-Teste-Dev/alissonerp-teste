import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { safeDiv } from "@/lib/dashboard-comercial/utils";
import { internalError } from "@/lib/api-error";

type PeriodoAgregado = { total: number; qtd: number };

// GET /api/dashboard-comercial/comparativo-anual?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Retorna comparativo ano atual vs ano anterior (faturamento, qtd vendas, ticket).

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  const [perm] = await sql`
    SELECT pode_ler FROM alissonerp.role_permissoes
    WHERE role = ${user.role} AND modulo = 'dashboard_comercial'
  `;
  if (!perm?.pode_ler) {
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

    const atual = await somarPeriodoERP(from, to);
    const anterior = await somarPeriodoAnoAnteriorLegado(fromAntIso, toAntIso);

    const totalAtual = atual.total;
    const qtdAtual = atual.qtd;
    const totalAnterior = anterior.total;
    const qtdAnterior = anterior.qtd;

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

/**
 * REGRA DE NEGOCIO (período atual no ERP):
 * O que faz: calcula faturamento líquido e quantidade de vendas no período atual
 * usando a view oficial do comercial no ERP.
 * Por que foi implementado assim: preserva a base já validada da dashboard atual
 * enquanto o comparativo histórico usa a régua legada para ano anterior.
 * Impacto se alterar/remover: o valor "Atual" pode sair da mesma referência
 * usada nas demais telas do dashboard comercial.
 */
async function somarPeriodoERP(from: string, to: string): Promise<PeriodoAgregado> {
  const [row] = await sql<Array<{ total: string; qtd: string }>>`
    SELECT
      COALESCE(SUM(v.total_venda - v.valor_vale_troca), 0)::text AS total,
      COUNT(*)::text AS qtd
    FROM alissonerp.vw_dash_vendas_todas v
    WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
      AND v.status IS NOT NULL AND v.status != 4
  `;

  return {
    total: Number(row?.total ?? 0),
    qtd: Number(row?.qtd ?? 0),
  };
}

/**
 * REGRA DE NEGOCIO (comparativo anual legado - fonte única histórica):
 * O que faz: replica exatamente a regra da dashboard antiga para o "ano anterior"
 * consolidando por numero_pedido e classificando cada pedido em VENDA,
 * DEVOLUÇÃO ou CANCELADO.
 * Por que foi implementado assim: garante compatibilidade numérica com a tela
 * antiga (ex.: valor histórico de referência) sem alterar banco, views ou migrações.
 * Impacto se alterar/remover: o "ano anterior" pode voltar a divergir da régua
 * histórica usada pela operação comercial, quebrando auditoria e comparabilidade.
 */
async function somarPeriodoAnoAnteriorLegado(from: string, to: string): Promise<PeriodoAgregado> {
  const [row] = await sql<Array<{ total: string; qtd: string }>>`
    WITH pedidos_consolidados AS (
      SELECT
        ppd.numero_pedido,
        MAX(COALESCE(ppd.situacao, '')) AS situacao,
        BOOL_OR(COALESCE(ppd.eh_devolucao, false)) AS possui_devolucao,
        COALESCE(SUM(COALESCE(ppd.valor_parcela, 0)), 0) AS valor_total,
        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(ppd.forma_pagamento_parcela, '')) = 'vale-troca' THEN 0
              ELSE COALESCE(ppd.valor_parcela, 0)
            END
          ),
          0
        ) AS valor_pagamentos_validos
      FROM public.pedidos_parcelas_detalhado ppd
      WHERE ppd.data_pedido BETWEEN ${from}::date AND ${to}::date
      GROUP BY ppd.numero_pedido
    ),
    classificados AS (
      SELECT
        pc.numero_pedido,
        CASE
          WHEN pc.situacao = '2' THEN 'CANCELADO'
          WHEN pc.possui_devolucao THEN 'DEVOLUCAO'
          ELSE 'VENDA'
        END AS classificacao,
        pc.valor_total,
        pc.valor_pagamentos_validos
      FROM pedidos_consolidados pc
    )
    SELECT
      COALESCE(
        SUM(
          CASE
            WHEN c.classificacao = 'VENDA' THEN c.valor_pagamentos_validos
            ELSE 0
          END
        ),
        0
      )::text AS total,
      COALESCE(
        COUNT(*) FILTER (WHERE c.classificacao = 'VENDA'),
        0
      )::text AS qtd
    FROM classificados c
  `;

  return {
    total: Number(row?.total ?? 0),
    qtd: Number(row?.qtd ?? 0),
  };
}
