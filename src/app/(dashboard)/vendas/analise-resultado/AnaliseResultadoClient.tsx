"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, TrendingUp, ShoppingBag, Percent, BarChart2, Target, BarChart, Table2 } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtPct(v: number) { return v.toFixed(1) + "%"; }

function diasUteis(inicio: Date, fim: Date): number {
  let count = 0;
  const d = new Date(inicio);
  while (d <= fim) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

interface RankingRow {
  vendedor_id:     number;
  vendedor_nome:   string;
  qtd_vendas:      number;
  total_venda:     number;
  total_desconto:  number;
  total_comissao:  number;
  ticket_medio:    number;
  meta_valor:      number | null;
  meta_quantidade: number | null;
  pct_meta:        number | null;
}

interface Dados {
  kpis: { faturamento: number; total_desconto: number; qtd_vendas: number; ticket_medio: number };
  meta_geral: number;
  ranking: RankingRow[];
}

interface Props { role: string; vendedorId: number | null; podeGerenciar: boolean; }

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, pct);
  const color = pct >= 100 ? "#059669" : pct >= 70 ? C.esmeralda : pct >= 40 ? "#D97706" : "#EF4444";
  return (
    <div className="w-full rounded-full h-1.5" style={{ backgroundColor: "#F3F4F6" }}>
      <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

export default function AnaliseResultadoClient({ vendedorId, podeGerenciar }: Props) {
  const now = new Date();
  const [inicio, setInicio] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [fim,    setFim]    = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [dados,   setDados]   = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/analise-resultado?inicio=${inicio}&fim=${fim}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDados(await res.json() as Dados);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [inicio, fim]);

  useEffect(() => { load(); }, [load]);

  // Cálculo de progresso esperado (pró-rata dias úteis)
  const inicioDate = new Date(inicio + "T00:00:00");
  const fimDate    = new Date(fim    + "T00:00:00");
  const hoje       = now < fimDate ? now : fimDate;
  const duMes      = diasUteis(inicioDate, fimDate);
  const duDecorridos = diasUteis(inicioDate, hoje);
  const pctDiasDecorridos = duMes > 0 ? duDecorridos / duMes : 0;

  const faturamento  = dados?.kpis.faturamento  ?? 0;
  const metaGeral    = dados?.meta_geral        ?? 0;
  const metaEsperada = metaGeral * pctDiasDecorridos;
  const pctMetaGeral = metaGeral > 0 ? Math.round((faturamento / metaGeral) * 100) : null;

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Análise de Resultado
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Performance comercial por período</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40" style={{ color: "#6B7280" }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filtros de data */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1.5 rounded-xl border px-3 py-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <span className="text-xs" style={{ color: "#6B7280" }}>De</span>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border px-3 py-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <span className="text-xs" style={{ color: "#6B7280" }}>Até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)}
            className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
        </div>
        {/* Atalhos de período */}
        {[
          { label: "Mês atual", fn: () => {
            const n = new Date();
            setInicio(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`);
            setFim(new Date(n.getFullYear(), n.getMonth()+1, 0).toISOString().slice(0,10));
          }},
          { label: "Mês anterior", fn: () => {
            const n = new Date();
            const m = n.getMonth() === 0 ? 12 : n.getMonth();
            const a = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear();
            setInicio(`${a}-${String(m).padStart(2,"0")}-01`);
            setFim(new Date(a, m, 0).toISOString().slice(0,10));
          }},
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn}
            className="rounded-xl border px-3 py-2 text-xs hover:opacity-80 transition-opacity"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: "#6B7280" }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : dados ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { icon: TrendingUp, label: "Faturamento",  value: fmt(dados.kpis.faturamento),        color: C.esmeralda },
              { icon: Percent,    label: "Descontos",    value: fmt(dados.kpis.total_desconto),      color: "#D97706"   },
              { icon: ShoppingBag,label: "Ticket Médio", value: fmt(dados.kpis.ticket_medio),        color: "#2563EB"   },
              { icon: BarChart2,  label: "Nº Vendas",   value: String(dados.kpis.qtd_vendas),        color: "#7C3AED"   },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color }} />
                  <p className="text-[11px] uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{label}</p>
                </div>
                <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Meta geral do mês */}
          {metaGeral > 0 && (
            <div className="rounded-xl border p-4 mb-5" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target size={14} style={{ color: C.esmeralda }} />
                  <p className="text-xs font-semibold" style={{ color: C.esmeralda }}>Meta do Período</p>
                </div>
                {pctMetaGeral !== null && (
                  <span className="text-sm font-bold tabular-nums" style={{ color: pctMetaGeral >= 100 ? "#059669" : C.esmeralda }}>
                    {pctMetaGeral}%
                  </span>
                )}
              </div>
              <ProgressBar pct={pctMetaGeral ?? 0} />
              <div className="flex justify-between mt-2 text-[11px]" style={{ color: "#9CA3AF" }}>
                <span>Realizado: {fmt(faturamento)}</span>
                <span>Esperado: {fmt(metaEsperada)} · Meta: {fmt(metaGeral)}</span>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>
                {duDecorridos} de {duMes} dias úteis ({Math.round(pctDiasDecorridos * 100)}% do período)
              </p>
            </div>
          )}

          {/* Toggle view */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: C.esmeralda }}>Ranking por Consultora</h3>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {([["table", Table2], ["chart", BarChart]] as const).map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode as "table" | "chart")}
                  className="p-1.5 transition-colors"
                  style={{
                    backgroundColor: viewMode === mode ? C.esmeralda : C.cremeBg,
                    color: viewMode === mode ? C.creme : "#6B7280",
                  }}>
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>

          {viewMode === "table" ? (
            /* Tabela */
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["#", "Consultora", "Alcançado", "Esperado", "Diferença", "% Meta", "Vendas", "Ticket Médio"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.ranking.map((row, idx) => {
                      const esperado = row.meta_valor != null ? row.meta_valor * pctDiasDecorridos : null;
                      const diferenca = row.meta_valor != null ? row.total_venda - row.meta_valor : null;
                      return (
                        <tr key={row.vendedor_id} className="border-t hover:bg-gray-50 transition-colors"
                          style={{ borderColor: C.cremeBorder }}>
                          <td className="px-3 py-2.5">
                            <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                              style={{ backgroundColor: idx < 3 ? C.esmeralda : "#F3F4F6", color: idx < 3 ? C.creme : "#6B7280" }}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "#1A1A1A" }}>
                            {row.vendedor_nome.split(" ")[0]}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(row.total_venda)}</td>
                          <td className="px-3 py-2.5 tabular-nums" style={{ color: "#6B7280" }}>{esperado != null ? fmt(esperado) : "—"}</td>
                          <td className="px-3 py-2.5 tabular-nums" style={{ color: diferenca != null ? (diferenca >= 0 ? "#059669" : "#EF4444") : "#6B7280" }}>
                            {diferenca != null ? (diferenca >= 0 ? "+" : "") + fmt(diferenca) : "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            {row.pct_meta != null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16">
                                  <ProgressBar pct={row.pct_meta} />
                                </div>
                                <span className="tabular-nums text-[11px] font-semibold"
                                  style={{ color: row.pct_meta >= 100 ? "#059669" : C.esmeralda }}>
                                  {row.pct_meta}%
                                </span>
                              </div>
                            ) : <span style={{ color: "#9CA3AF" }}>—</span>}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-center" style={{ color: "#6B7280" }}>{row.qtd_vendas}</td>
                          <td className="px-3 py-2.5 tabular-nums" style={{ color: "#6B7280" }}>{fmt(row.ticket_medio)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {dados.ranking.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: "#9CA3AF" }}>Nenhuma venda no período</p>
              )}
            </div>
          ) : (
            /* Gráfico de barras simples */
            <div className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
              {dados.ranking.length === 0 ? (
                <p className="text-center text-sm py-4" style={{ color: "#9CA3AF" }}>Nenhuma venda no período</p>
              ) : (() => {
                const maxVal = Math.max(...dados.ranking.map(r => r.total_venda), 1);
                return (
                  <div className="space-y-3">
                    {dados.ranking.map((row) => (
                      <div key={row.vendedor_id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium truncate max-w-[120px]" style={{ color: "#1A1A1A" }}>{row.vendedor_nome.split(" ")[0]}</span>
                          <span className="tabular-nums font-bold" style={{ color: C.esmeralda }}>{fmt(row.total_venda)}</span>
                        </div>
                        <div className="w-full rounded-full h-3 relative" style={{ backgroundColor: "#F3F4F6" }}>
                          <div className="h-3 rounded-full transition-all duration-500"
                            style={{ width: `${(row.total_venda / maxVal) * 100}%`, backgroundColor: C.esmeralda }} />
                          {row.meta_valor != null && (
                            <div className="absolute top-0 h-3 w-0.5 rounded"
                              style={{ left: `${Math.min(100, (row.meta_valor / maxVal) * 100)}%`, backgroundColor: "#EF4444", opacity: 0.7 }} />
                          )}
                        </div>
                        {row.meta_valor != null && (
                          <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Meta: {fmt(row.meta_valor)} · {row.pct_meta ?? 0}%</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Nota dias úteis */}
          {!podeGerenciar && (
            <p className="text-[11px] mt-3 text-center" style={{ color: "#9CA3AF" }}>
              {MESES[new Date(inicio + "T00:00:00").getMonth()]} {new Date(inicio + "T00:00:00").getFullYear()} — {duDecorridos}/{duMes} dias úteis
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
