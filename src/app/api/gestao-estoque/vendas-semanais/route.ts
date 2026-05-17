/**
 * GET /api/gestao-estoque/vendas-semanais
 *
 * Retorna agregacao semanal das vendas nos ultimos N semanas (default 12),
 * alimentando as sparklines dos KPIs do Dashboard de Inteligencia de Estoque.
 *
 * Response:
 * {
 *   semanas: [
 *     { semana: '2026-02-02', qtd_vendas: 45, qtd_itens: 120, valor_total: 148320.50 },
 *     ...
 *   ],
 *   agregados: {
 *     total_vendas: 560, total_itens: 1420, total_valor: 1890123.40,
 *     media_semanal_valor: 157510.28,
 *     delta_pct_vs_4sem_anteriores: 8.4  // crescimento das ultimas 4sem vs 4sem antes
 *   }
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { temAcessoModulo } from "@/lib/permissoes";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!(await temAcessoModulo(user.role, "produtos", "ler"))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const semanasParam = Number(searchParams.get("semanas") ?? 12);
  const semanas = Math.max(4, Math.min(52, Number.isFinite(semanasParam) ? semanasParam : 12));

  try {
    // Agregado por semana (ISO week starting Monday)
    const rows = await sql<{
      semana: Date;
      qtd_vendas: number;
      qtd_itens: number;
      valor_total: string;
    }[]>`
      WITH base AS (
        SELECT
          date_trunc('week', v.data_venda)::date AS semana,
          v.id                                     AS venda_id,
          COALESCE(SUM(iv.quantidade), 0)::numeric AS qtd_itens_venda,
          COALESCE(SUM(iv.preco_total), 0)::numeric AS valor_venda
        FROM public.vendas v
        LEFT JOIN public.itens_venda iv ON iv.venda_id = v.id
        WHERE v.data_venda >= (CURRENT_DATE - (${semanas}::int * INTERVAL '7 days'))
        GROUP BY 1, v.id
      )
      SELECT
        semana,
        COUNT(DISTINCT venda_id)::int   AS qtd_vendas,
        COALESCE(SUM(qtd_itens_venda), 0)::int AS qtd_itens,
        COALESCE(SUM(valor_venda), 0)::numeric  AS valor_total
      FROM base
      GROUP BY 1
      ORDER BY 1
    `;

    const serie = rows.map(r => ({
      semana: r.semana instanceof Date ? r.semana.toISOString().slice(0, 10) : String(r.semana).slice(0, 10),
      qtd_vendas: Number(r.qtd_vendas) || 0,
      qtd_itens: Number(r.qtd_itens) || 0,
      valor_total: Number(r.valor_total) || 0,
    }));

    // Preencher semanas faltantes com zeros (pro grafico ficar continuo)
    const hoje = new Date();
    const segundaHoje = new Date(hoje);
    segundaHoje.setUTCDate(segundaHoje.getUTCDate() - ((segundaHoje.getUTCDay() + 6) % 7));
    segundaHoje.setUTCHours(0, 0, 0, 0);

    const preenchida: typeof serie = [];
    for (let i = semanas - 1; i >= 0; i--) {
      const d = new Date(segundaHoje);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const key = d.toISOString().slice(0, 10);
      const existing = serie.find(s => s.semana === key);
      preenchida.push(existing ?? { semana: key, qtd_vendas: 0, qtd_itens: 0, valor_total: 0 });
    }

    // Agregados
    const total_vendas = preenchida.reduce((a, r) => a + r.qtd_vendas, 0);
    const total_itens = preenchida.reduce((a, r) => a + r.qtd_itens, 0);
    const total_valor = preenchida.reduce((a, r) => a + r.valor_total, 0);
    const media_semanal_valor = preenchida.length ? total_valor / preenchida.length : 0;

    // Delta: media dos ultimos 4 vs 4 anteriores
    const ult4 = preenchida.slice(-4);
    const ant4 = preenchida.slice(-8, -4);
    const mediaUlt4 = ult4.reduce((a, r) => a + r.valor_total, 0) / Math.max(1, ult4.length);
    const mediaAnt4 = ant4.reduce((a, r) => a + r.valor_total, 0) / Math.max(1, ant4.length);
    const delta_pct_vs_4sem_anteriores = mediaAnt4 > 0
      ? Number((((mediaUlt4 - mediaAnt4) / mediaAnt4) * 100).toFixed(1))
      : 0;

    return NextResponse.json({
      semanas: preenchida,
      agregados: {
        total_vendas,
        total_itens,
        total_valor: Number(total_valor.toFixed(2)),
        media_semanal_valor: Number(media_semanal_valor.toFixed(2)),
        delta_pct_vs_4sem_anteriores,
      },
    });
  } catch (err) {
    console.error("[GET /api/gestao-estoque/vendas-semanais]", err);
    return NextResponse.json({ error: "Erro ao carregar serie semanal" }, { status: 500 });
  }
}
