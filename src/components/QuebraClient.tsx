"use client";

import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, ReferenceLine,
} from "recharts";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  bg: "#FAFAF7",
  danger: "#DC2626",
  warning: "#F59E0B",
  success: "#10B981",
};

const tooltipStyle = {
  contentStyle: {
    borderRadius: 8,
    border: `1px solid ${C.cremeBorder}`,
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
};

function pctColor(pct: number) {
  if (pct > 5) return C.danger;
  if (pct > 3) return C.warning;
  return C.success;
}

interface Props {
  quebraOurives: any[];
  quebraMensal: any[];
  quebraDeposito: any[];
  cotacaoOuro: number;
}

export default function QuebraClient({ quebraOurives, quebraMensal, quebraDeposito, cotacaoOuro }: Props) {
  const totals = useMemo(() => {
    const totalMetal  = quebraOurives.reduce((s, o) => s + Number(o.total_metal  || 0), 0);
    const totalQuebra = quebraOurives.reduce((s, o) => s + Number(o.total_quebra || 0), 0);
    const totalOrdens = quebraOurives.reduce((s, o) => s + Number(o.total_ordens || 0), 0);
    const pct = totalMetal > 0 ? (totalQuebra / totalMetal) * 100 : 0;
    return { totalMetal, totalQuebra, totalOrdens, pct, valorPerdido: totalQuebra * cotacaoOuro };
  }, [quebraOurives, cotacaoOuro]);

  const pieData = useMemo(() => {
    const totalPmc     = quebraOurives.reduce((s, o) => s + Number(o.total_pmc     || 0), 0);
    const totalRetorno = quebraOurives.reduce((s, o) => s + Number(o.total_retorno || 0), 0);
    return [
      { name: "PMC (na peça)", value: Math.round(totalPmc     * 100) / 100, fill: C.esmeralda },
      { name: "Retorno",       value: Math.round(totalRetorno * 100) / 100, fill: C.sage },
      { name: "Quebra",        value: Math.round(totals.totalQuebra * 100) / 100, fill: C.dourado },
    ].filter((d) => d.value > 0);
  }, [quebraOurives, totals]);

  const alertas = quebraOurives.filter((o) => Number(o.percentual_medio) > 5);

  const initials = (nome: string) =>
    (nome ?? "??").split(" ").slice(0, 2).map((n: string) => n[0] ?? "").join("").toUpperCase();

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h2
          className="text-xl md:text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
        >
          Quebra de Ouro
        </h2>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Análise de perda de metal na produção — directus.pcp (concluídos com metal)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Metal Processado",
            value: `${totals.totalMetal.toFixed(2)}g`,
            sub: `${totals.totalOrdens} ordens concluídas`,
            color: C.esmeralda,
          },
          {
            label: "Quebra Total",
            value: `${totals.totalQuebra.toFixed(2)}g`,
            sub: "Metal perdido no processo",
            color: C.dourado,
          },
          {
            label: "Percentual Médio",
            value: `${totals.pct.toFixed(2)}%`,
            sub: "Meta: < 5%",
            color: pctColor(totals.pct),
          },
          {
            label: "Valor Perdido",
            value: `R$ ${totals.valorPerdido.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`,
            sub: `Cotação R$ ${cotacaoOuro}/g`,
            color: C.danger,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border p-5"
            style={{ borderColor: C.cremeBorder }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
              {card.label}
            </p>
            <p className="text-2xl font-mono font-semibold" style={{ color: card.color }}>
              {card.value}
            </p>
            <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-4 space-y-2">
          {alertas.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
              style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
            >
              <span className="font-bold">!</span>
              <span>
                <strong>{a.operador_nome}</strong>: quebra de{" "}
                <strong>{Number(a.percentual_medio).toFixed(2)}%</strong> — acima do limite de 5%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Ranking ourives — 3 colunas */}
        <div
          className="lg:col-span-3 bg-white rounded-xl border p-5"
          style={{ borderColor: C.cremeBorder }}
        >
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#1A1A1A" }}>
            Quebra por Ourives
          </h3>

          {quebraOurives.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "#6B7280" }}>
              Sem dados (nenhum PCP concluído com metal)
            </p>
          ) : (
            <div className="space-y-4">
              {quebraOurives.map((o, i) => {
                const pct = Number(o.percentual_medio);
                const cor = pctColor(pct);
                const bgCor = pct > 5 ? "#FEF2F2" : pct > 3 ? "#FFFBEB" : "#ECFDF5";
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: bgCor, color: cor }}
                    >
                      {initials(o.operador_nome)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>
                          {o.operador_nome}
                        </span>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-[11px] font-mono" style={{ color: "#6B7280" }}>
                            {Number(o.total_metal).toFixed(2)}g · {o.total_ordens} ordens
                          </span>
                          <span className="font-mono text-sm font-bold" style={{ color: cor }}>
                            {pct.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.creme }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min((pct / 10) * 100, 100)}%`,
                            backgroundColor: cor,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna direita — 2 colunas */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Pizza distribuição */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "#1A1A1A" }}>
              Distribuição do Metal
            </h3>
            {pieData.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: "#6B7280" }}>
                Sem dados
              </p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%" cy="50%"
                      innerRadius={38} outerRadius={62}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => `${Number(v ?? 0)}g`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-1">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px]" style={{ color: "#6B7280" }}>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Tendência mensal */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: "#1A1A1A" }}>
              Tendência Mensal (%)
            </h3>
            {quebraMensal.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: "#6B7280" }}>
                Sem dados mensais
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={quebraMensal} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.cremeBorder} vertical={false} />
                  <XAxis
                    dataKey="mes_label"
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  />
                  <YAxis
                    axisLine={false} tickLine={false}
                    tick={{ fontSize: 10, fill: "#9CA3AF" }}
                    unit="%"
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v) => [`${Number(v ?? 0)}%`, "Quebra"]}
                  />
                  <ReferenceLine
                    y={5}
                    stroke={C.danger}
                    strokeDasharray="4 4"
                    label={{ value: "Meta 5%", fill: C.danger, fontSize: 10, position: "insideTopRight" }}
                  />
                  <Bar
                    dataKey="percentual_quebra"
                    radius={[4, 4, 0, 0]}
                    fill={C.sage}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Card cotação */}
          <div
            className="rounded-xl p-5"
            style={{ background: `linear-gradient(135deg, ${C.esmeralda}, #0F2922)` }}
          >
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: C.sage }}>
              Cotação do Ouro Hoje
            </p>
            <p className="text-2xl font-mono font-semibold" style={{ color: C.creme }}>
              R$ {cotacaoOuro}
              <span className="text-sm ml-1" style={{ color: C.sage }}>/g</span>
            </p>
            <p className="text-[11px] mt-2" style={{ color: C.sage }}>
              Fonte: alissonerp.parametros
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
