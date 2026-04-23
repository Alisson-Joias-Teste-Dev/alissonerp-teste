"use client";

import { useState } from "react";
import DashboardHeader from "@/components/dashboard-comercial/DashboardHeader";
import { LoadingBlock, ErrorBlock } from "@/components/dashboard-comercial/LoadingBlock";
import ConsultoraAvatar from "@/components/dashboard-comercial/ConsultoraAvatar";
import { P, METAS_COR } from "@/components/dashboard-comercial/theme";
import { formatBRL, formatPercent, getToday } from "@/lib/dashboard-comercial/utils";
import { useDateRange, useAnalisePerformance } from "@/hooks/dashboard-comercial/useDashboardData";
import type { ResumoPerformance, TipoMeta } from "@/lib/types/dashboard-comercial";

const CENARIOS = [
  { id: "horario_acumulado", label: "Horário (acumulado)", desc: "Vendas de hoje × meta acumulada até agora", usaHoje: true },
  { id: "horario_diario", label: "Horário (dia)", desc: "Vendas de hoje × meta total do dia", usaHoje: true },
  { id: "mensal_acumulado", label: "Mensal acumulada", desc: "Vendas do mês × meta acumulada do mês", usaHoje: false },
  { id: "projecao_mensal", label: "Projeção mensal", desc: "Vendas do mês × meta total do mês", usaHoje: false },
] as const;

type CenarioId = (typeof CENARIOS)[number]["id"];

export default function AnaliseResultadoPage() {
  const { from, to, setRange } = useDateRange();
  const [cenario, setCenario] = useState<CenarioId>("projecao_mensal");
  const [tipoMeta, setTipoMeta] = useState<TipoMeta>("Prata");
  const perf = useAnalisePerformance(from, to, getToday());

  return (
    <div className="p-6">
      <DashboardHeader
        title="Análise de Performance"
        subtitle="Acompanhamento em 4 cenários: horário acumulado, diário, mensal acumulado e projeção mensal"
        from={from}
        to={to}
        onRangeChange={setRange}
      />

      {/* Tabs de cenário */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {CENARIOS.map((c) => {
          const active = cenario === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCenario(c.id)}
              className="rounded-lg p-3 text-left transition-colors"
              style={{
                backgroundColor: active ? P.esmeralda : P.cremeSoft,
                color: active ? P.creme : P.esmeralda,
                border: `1px solid ${active ? P.esmeralda : P.cremeMuted}`,
              }}
            >
              <div className="text-sm font-semibold">{c.label}</div>
              <div className="mt-1 text-xs opacity-80">{c.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Tabs tipo meta */}
      <div className="mb-4 flex gap-2">
        {(["Prata", "Ouro", "Diamante"] as TipoMeta[]).map((tipo) => {
          const active = tipoMeta === tipo;
          const cor = METAS_COR[tipo];
          return (
            <button
              key={tipo}
              onClick={() => setTipoMeta(tipo)}
              className="rounded-md px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: active ? cor.ring : cor.bg,
                color: active ? "#fff" : cor.fg,
                border: `1px solid ${cor.ring}`,
              }}
            >
              {tipo}
            </button>
          );
        })}
      </div>

      {perf.loading && <LoadingBlock label="Calculando performance..." />}
      {perf.error && <ErrorBlock error={perf.error} />}
      {perf.data && (
        <PerformanceTable
          dados={perf.data[cenario]}
          tipoMeta={tipoMeta}
          usaHoje={CENARIOS.find((c) => c.id === cenario)!.usaHoje}
        />
      )}
    </div>
  );
}

function PerformanceTable({
  dados,
  tipoMeta,
  usaHoje,
}: {
  dados: ResumoPerformance[];
  tipoMeta: TipoMeta;
  usaHoje: boolean;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: P.creme, border: `1px solid ${P.cremeMuted}` }}
    >
      <table className="w-full text-sm">
        <thead style={{ backgroundColor: P.cremeSoft }}>
          <tr>
            <th className="px-4 py-2 text-left" style={{ color: P.esmeralda }}>
              Consultora
            </th>
            <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
              {usaHoje ? "Vendas hoje" : "Vendas período"}
            </th>
            <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
              Meta {tipoMeta}
            </th>
            <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
              Diferença
            </th>
            <th className="px-4 py-2 text-right" style={{ color: P.esmeralda }}>
              % Meta
            </th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => {
            const m = d.metas[tipoMeta];
            const alcancado = usaHoje ? d.vendas_hoje : d.alcancado_periodo;
            const diferenca = alcancado - m.esperado;
            const perc = m.projecao_percentual;
            const cor = perc >= 100 ? P.sucesso : perc >= 70 ? P.dourado : P.erro;
            return (
              <tr
                key={d.id_vendedor}
                className="border-t"
                style={{ borderColor: P.cremeMuted }}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ConsultoraAvatar nome={d.nome} foto={d.foto} size={28} />
                    <span style={{ color: P.esmeralda }}>{d.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeralda }}>
                  {formatBRL(alcancado)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.esmeraldaMid }}>
                  {formatBRL(m.esperado)}
                </td>
                <td
                  className="px-4 py-2 text-right tabular-nums font-medium"
                  style={{ color: diferenca >= 0 ? P.sucesso : P.erro }}
                >
                  {diferenca >= 0 ? "+" : ""}
                  {formatBRL(diferenca)}
                </td>
                <td className="px-4 py-2 text-right">
                  <span
                    className="inline-block rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
                    style={{ color: cor, backgroundColor: `${cor}22` }}
                  >
                    {isFinite(perc) ? formatPercent(perc) : "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
