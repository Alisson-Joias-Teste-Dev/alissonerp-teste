import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import type { LeadsDashboardResponse, LeadsConsultoraStats } from "@/lib/types/dashboard-comercial";
import { safeDiv } from "@/lib/dashboard-comercial/utils";
import { internalError } from "@/lib/api-error";

// GET /api/dashboard-comercial/leads?from=...&to=...
//
// Retorna:
//   geral         → total leads, ativos, fechados, ganhos, perdidos, taxas
//   por_consultora → mesmas métricas por vendedor
//
// Regras (baseadas no alison-joias):
//   - Lead "ganho"    → etapa_lead IN ('GANHO', 'FINALIZADO') OR status_id = 142
//   - Lead "perdido"  → etapa_lead IN ('PERDIDO', 'CANCELADO', 'Venda perdida') OR status_id = 143
//   - Lead "fechado"  → ganho OR perdido OR data_fechamento IS NOT NULL
//   - Lead "ativo"    → !fechado
//   - Exclui "Incoming leads"

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
    const leads = await sql<
      Array<{
        id_vendedor: number | null;
        nome: string | null;
        foto: string | null;
        ganho: number;
        perdido: number;
        fechado: number;
        total: number;
      }>
    >`
      WITH classificados AS (
        SELECT
          l.id_vendedor,
          CASE
            WHEN l.etapa_lead IN ('GANHO', 'FINALIZADO') OR l.status_id = 142 THEN 1 ELSE 0
          END AS eh_ganho,
          CASE
            WHEN l.etapa_lead IN ('PERDIDO', 'CANCELADO', 'Venda perdida') OR l.status_id = 143 THEN 1 ELSE 0
          END AS eh_perdido,
          CASE
            WHEN l.etapa_lead IN ('GANHO', 'FINALIZADO', 'PERDIDO', 'CANCELADO', 'Venda perdida')
              OR l.status_id IN (142, 143)
              OR l.data_fechamento IS NOT NULL THEN 1 ELSE 0
          END AS eh_fechado
        FROM alissonerp.vw_dash_leads l
        WHERE l.data_entrada BETWEEN ${from}::date AND ${to}::date
          AND COALESCE(l.etapa_lead, '') <> 'Incoming leads'
      )
      SELECT
        c.id_vendedor,
        vd.nome,
        vd.foto,
        SUM(c.eh_ganho)::int    AS ganho,
        SUM(c.eh_perdido)::int  AS perdido,
        SUM(c.eh_fechado)::int  AS fechado,
        COUNT(*)::int           AS total
      FROM classificados c
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = c.id_vendedor
      GROUP BY c.id_vendedor, vd.nome, vd.foto
    `;

    // Vendas realizadas no período (para calcular conversão)
    const vendasPorConsultora = await sql<Array<{ vendedor_id: number; qtd: number }>>`
      SELECT vendedor_id, COUNT(*)::int AS qtd
      FROM alissonerp.vw_dash_vendas_todas
      WHERE data_venda BETWEEN ${from}::date AND ${to}::date
        AND status IS NOT NULL AND status != 4
        AND vendedor_id IS NOT NULL
      GROUP BY vendedor_id
    `;
    const vendasMap = new Map<number, number>();
    vendasPorConsultora.forEach((v) => vendasMap.set(v.vendedor_id, v.qtd));

    // Agregado por consultora
    const porConsultora: LeadsConsultoraStats[] = leads
      .filter((l) => l.id_vendedor !== null)
      .map((l) => {
        const fechado = l.fechado;
        const ativo = l.total - fechado;
        const vendasRealizadas = vendasMap.get(l.id_vendedor!) ?? 0;
        return {
          id_vendedor: l.id_vendedor!,
          nome: l.nome ?? "Não informada",
          foto: l.foto,
          total_leads: l.total,
          leads_ativos: ativo,
          leads_fechados: fechado,
          ganhos: l.ganho,
          perdidos: l.perdido,
          vendas_realizadas: vendasRealizadas,
          taxa_conversao_geral: safeDiv(vendasRealizadas, l.total) * 100,
          taxa_conversao_fechamento: safeDiv(vendasRealizadas, fechado) * 100,
        };
      })
      .sort((a, b) => b.vendas_realizadas - a.vendas_realizadas);

    // Geral (somatório)
    const totalLeads = leads.reduce((s, l) => s + l.total, 0);
    const totalGanhos = leads.reduce((s, l) => s + l.ganho, 0);
    const totalPerdidos = leads.reduce((s, l) => s + l.perdido, 0);
    const totalFechados = leads.reduce((s, l) => s + l.fechado, 0);
    const totalAtivos = totalLeads - totalFechados;
    const totalVendas = Array.from(vendasMap.values()).reduce((s, v) => s + v, 0);

    const response: LeadsDashboardResponse = {
      geral: {
        total_leads: totalLeads,
        leads_ativos: totalAtivos,
        leads_fechados: totalFechados,
        ganhos: totalGanhos,
        perdidos: totalPerdidos,
        taxa_conversao_geral: safeDiv(totalVendas, totalLeads) * 100,
        taxa_conversao_fechamento: safeDiv(totalVendas, totalFechados) * 100,
        percentual_ativos: safeDiv(totalAtivos, totalLeads) * 100,
        percentual_fechados: safeDiv(totalFechados, totalLeads) * 100,
        percentual_ganhos: safeDiv(totalGanhos, totalLeads) * 100,
        percentual_perdidos: safeDiv(totalPerdidos, totalLeads) * 100,
      },
      por_consultora: porConsultora,
    };

    return NextResponse.json(response);
  } catch (err) {
    return internalError("[GET /api/dashboard-comercial/leads]", err);
  }
}
