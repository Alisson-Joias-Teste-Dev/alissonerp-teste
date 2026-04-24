import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import type {
  AnalisePerformanceResponse,
  ResumoPerformance,
  TipoMeta,
} from "@/lib/types/dashboard-comercial";
import { safeDiv } from "@/lib/dashboard-comercial/utils";

// GET /api/dashboard-comercial/analise-performance?from=...&to=...&refDate=YYYY-MM-DD
//
// Retorna 4 cenários de performance:
//   horario_acumulado  → vendas_hoje vs meta acumulada até agora (hoje)
//   horario_diario     → vendas_hoje vs meta total do dia
//   mensal_acumulado   → vendas_periodo vs meta acumulada até agora (mês)
//   projecao_mensal    → vendas_periodo vs meta fim do mês

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

  const from = params.get("from") ?? inicioMes.toISOString().slice(0, 10);
  const to = params.get("to") ?? fimMes.toISOString().slice(0, 10);
  const refDate = params.get("refDate") ?? hoje.toISOString().slice(0, 10);

  try {
    // ---------- Vendas do período (mês) e de hoje (legado + ERP, vale-troca pré-computado) ----------
    const vendasPeriodo = await sql<
      Array<{ vendedor_id: number; nome: string | null; foto: string | null; total: string; qtd: string }>
    >`
      SELECT v.vendedor_id, vd.nome, vd.foto,
             SUM(v.total_venda - v.valor_vale_troca)::text AS total,
             COUNT(*)::text AS qtd
      FROM alissonerp.vw_dash_vendas_todas v
      LEFT JOIN alissonerp.vw_dash_vendedores vd ON vd.id_vendedor = v.vendedor_id
      WHERE v.data_venda BETWEEN ${from}::date AND ${to}::date
        AND v.status = 2 AND v.vendedor_id IS NOT NULL
      GROUP BY v.vendedor_id, vd.nome, vd.foto
    `;

    const vendasHoje = await sql<
      Array<{ vendedor_id: number; total: string }>
    >`
      SELECT v.vendedor_id,
             SUM(v.total_venda - v.valor_vale_troca)::text AS total
      FROM alissonerp.vw_dash_vendas_todas v
      WHERE v.data_venda = ${refDate}::date
        AND v.status = 2 AND v.vendedor_id IS NOT NULL
      GROUP BY v.vendedor_id
    `;
    const vendasHojeMap = new Map<number, number>();
    for (const v of vendasHoje) vendasHojeMap.set(v.vendedor_id, Number(v.total));

    // ---------- Metas: 4 agregações ----------
    // 1. Acumulada até refDate (agora) dentro do mês → cenário mensal-acumulado
    const metasMesAcumulado = await aggMetas(sql, from, to, refDate, "ate_now");
    // 2. Valor total do mês → cenário projeção mensal
    const metasMesTotal = await aggMetas(sql, from, to, refDate, "mes_total");
    // 3. Acumulada até hora atual do dia refDate → cenário horario-acumulado
    const metasHojeAcumulado = await aggMetasDia(sql, refDate, "ate_now");
    // 4. Total do dia refDate → cenário horario-diario
    const metasHojeTotal = await aggMetasDia(sql, refDate, "dia_total");

    // Monta Map base com todas consultoras com vendas OU metas
    const idsConsultoras = new Set<number>();
    vendasPeriodo.forEach((v) => idsConsultoras.add(v.vendedor_id));
    [metasMesAcumulado, metasMesTotal, metasHojeAcumulado, metasHojeTotal].forEach((group) =>
      group.forEach((m) => idsConsultoras.add(Number(m.consultora))),
    );

    // Busca dados básicos dos vendedores
    const vendedoresInfo = await sql<Array<{ id_vendedor: number; nome: string | null; foto: string | null }>>`
      SELECT id_vendedor, nome, foto
      FROM alissonerp.vw_dash_vendedores
      WHERE id_vendedor = ANY(${Array.from(idsConsultoras)}::bigint[])
    `;
    const infoMap = new Map<number, { nome: string | null; foto: string | null }>();
    vendedoresInfo.forEach((v) => infoMap.set(v.id_vendedor, { nome: v.nome, foto: v.foto }));

    // Monta os 4 cenários
    const cenarios: Record<string, ResumoPerformance[]> = {
      mensal_acumulado: [],
      projecao_mensal: [],
      horario_acumulado: [],
      horario_diario: [],
    };

    for (const id of idsConsultoras) {
      const vendaLinha = vendasPeriodo.find((v) => v.vendedor_id === id);
      const alcancadoPeriodo = vendaLinha ? Number(vendaLinha.total) : 0;
      const qtd = vendaLinha ? Number(vendaLinha.qtd) : 0;
      const vendasHoje = vendasHojeMap.get(id) ?? 0;
      const info = infoMap.get(id);
      const nome = info?.nome ?? vendaLinha?.nome ?? "Não informada";
      const foto = info?.foto ?? vendaLinha?.foto ?? null;

      const mkMetas = (
        metasSrc: Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>,
        alcancado: number,
      ): ResumoPerformance["metas"] => {
        const obj = {
          Prata: { esperado: 0, projecao_valor: 0, projecao_percentual: 0 },
          Ouro: { esperado: 0, projecao_valor: 0, projecao_percentual: 0 },
          Diamante: { esperado: 0, projecao_valor: 0, projecao_percentual: 0 },
        };
        for (const m of metasSrc) {
          if (Number(m.consultora) !== id) continue;
          obj[m.tipo_meta].esperado = Number(m.total);
        }
        for (const tipo of ["Prata", "Ouro", "Diamante"] as TipoMeta[]) {
          obj[tipo].projecao_valor = alcancado - obj[tipo].esperado;
          obj[tipo].projecao_percentual = safeDiv(alcancado, obj[tipo].esperado) * 100;
        }
        return obj;
      };

      const base = (alcancado: number): ResumoPerformance => ({
        id_vendedor: id,
        nome,
        foto,
        alcancado_periodo: alcancadoPeriodo,
        vendas_hoje: vendasHoje,
        quantidade_vendas: qtd,
        ticket_medio: safeDiv(alcancadoPeriodo, qtd),
        metas: mkMetas([], alcancado),
      });

      cenarios.mensal_acumulado.push({ ...base(alcancadoPeriodo), metas: mkMetas(metasMesAcumulado, alcancadoPeriodo) });
      cenarios.projecao_mensal.push({ ...base(alcancadoPeriodo), metas: mkMetas(metasMesTotal, alcancadoPeriodo) });
      cenarios.horario_acumulado.push({ ...base(vendasHoje), metas: mkMetas(metasHojeAcumulado, vendasHoje) });
      cenarios.horario_diario.push({ ...base(vendasHoje), metas: mkMetas(metasHojeTotal, vendasHoje) });
    }

    // Total de metas do mês (cards)
    const totalMetas = { Prata: 0, Ouro: 0, Diamante: 0 };
    for (const m of metasMesTotal) {
      totalMetas[m.tipo_meta] += Number(m.total);
    }

    const response: AnalisePerformanceResponse = {
      total_metas: totalMetas,
      horario_acumulado: cenarios.horario_acumulado.sort((a, b) => b.vendas_hoje - a.vendas_hoje),
      horario_diario: cenarios.horario_diario.sort((a, b) => b.vendas_hoje - a.vendas_hoje),
      mensal_acumulado: cenarios.mensal_acumulado.sort((a, b) => b.alcancado_periodo - a.alcancado_periodo),
      projecao_mensal: cenarios.projecao_mensal.sort((a, b) => b.alcancado_periodo - a.alcancado_periodo),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dashboard-comercial/analise-performance]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// helpers de agregação de metas
async function aggMetas(
  sqlFn: typeof sql,
  from: string,
  to: string,
  refDate: string,
  modo: "ate_now" | "mes_total",
): Promise<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>> {
  if (modo === "ate_now") {
    return await sqlFn<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>>`
      SELECT consultora::text, tipo_meta, COALESCE(SUM(meta_acumulada), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora BETWEEN ${from}::timestamp AND ${refDate}::timestamp + INTERVAL '23 hours 59 minutes 59 seconds'
        AND valor_meta > 0
      GROUP BY consultora, tipo_meta
    `;
  }
  return await sqlFn<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>>`
    SELECT consultora::text, tipo_meta, COALESCE(SUM(valor_meta), 0)::text AS total
    FROM alissonerp.vw_dash_metas_por_hora
    WHERE data_hora BETWEEN ${from}::timestamp AND (${to}::date + INTERVAL '1 day - 1 second')::timestamp
      AND valor_meta > 0
    GROUP BY consultora, tipo_meta
  `;
}

async function aggMetasDia(
  sqlFn: typeof sql,
  refDate: string,
  modo: "ate_now" | "dia_total",
): Promise<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>> {
  if (modo === "ate_now") {
    return await sqlFn<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>>`
      SELECT consultora::text, tipo_meta, COALESCE(SUM(meta_acumulada), 0)::text AS total
      FROM alissonerp.vw_dash_metas_por_hora
      WHERE data_hora::date = ${refDate}::date
        AND data_hora <= NOW()
        AND valor_meta > 0
      GROUP BY consultora, tipo_meta
    `;
  }
  return await sqlFn<Array<{ consultora: string; tipo_meta: TipoMeta; total: string }>>`
    SELECT consultora::text, tipo_meta, COALESCE(SUM(valor_meta), 0)::text AS total
    FROM alissonerp.vw_dash_metas_por_hora
    WHERE data_hora::date = ${refDate}::date
      AND valor_meta > 0
    GROUP BY consultora, tipo_meta
  `;
}
