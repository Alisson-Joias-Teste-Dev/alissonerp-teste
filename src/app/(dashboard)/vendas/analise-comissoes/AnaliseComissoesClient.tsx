"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, DollarSign, Percent, TrendingDown, Award } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtPct(v: number) { return v.toFixed(2) + "%"; }
function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(String(d).includes("T") ? d : d + "T12:00:00");
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

interface VendedorComissao {
  vendedor_id: number; vendedor_nome: string; qtd_vendas: number;
  comissao_total: number; desconto_total: number; total_venda: number;
  pct_comissao_medio: number; pct_desconto_medio: number;
}
interface ItemComissao {
  nome_produto: string; sku: string | null; quantidade: number;
  pct_desconto: number; pct_comissao: number; valor_comissao: number;
  total_item: number; numero_venda: string; data_venda: string; vendedor_nome: string;
}
interface Dados {
  kpis: { comissao_total: number; desconto_total: number; faturamento: number; pct_comissao_medio: number; pct_desconto_medio: number };
  por_vendedora: VendedorComissao[];
  itens: ItemComissao[];
}

export default function AnaliseComissoesClient({ podeGerenciar, vendedorId }: { podeGerenciar: boolean; vendedorId: number | null }) {
  const now = new Date();
  const [inicio, setInicio] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [fim,    setFim]    = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [dados,   setDados]   = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [aba,     setAba]     = useState<"vendedoras" | "itens">("vendedoras");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/analise-comissoes?inicio=${inicio}&fim=${fim}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDados(await res.json() as Dados);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [inicio, fim]);

  useEffect(() => { load(); }, [load]);

  const destaques = dados ? {
    maiorComissao:   dados.por_vendedora[0] ?? null,
    maiorPct:        [...dados.por_vendedora].sort((a, b) => b.pct_comissao_medio - a.pct_comissao_medio)[0] ?? null,
    maiorDesconto:   [...dados.por_vendedora].sort((a, b) => b.pct_desconto_medio - a.pct_desconto_medio)[0] ?? null,
    qtdVendedoras:   dados.por_vendedora.length,
  } : null;

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Análise de Comissões
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Comissões e descontos por período</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40" style={{ color: "#6B7280" }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex items-center gap-1.5 rounded-xl border px-3 py-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <span className="text-xs" style={{ color: "#6B7280" }}>De</span>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border px-3 py-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
          <span className="text-xs" style={{ color: "#6B7280" }}>Até</span>
          <input type="date" value={fim} onChange={e => setFim(e.target.value)} className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
        </div>
        {[
          { label: "Mês atual", fn: () => { const n = new Date(); setInicio(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`); setFim(new Date(n.getFullYear(), n.getMonth()+1, 0).toISOString().slice(0,10)); } },
          { label: "Mês anterior", fn: () => { const n = new Date(); const m = n.getMonth()===0?12:n.getMonth(); const a = n.getMonth()===0?n.getFullYear()-1:n.getFullYear(); setInicio(`${a}-${String(m).padStart(2,"0")}-01`); setFim(new Date(a,m,0).toISOString().slice(0,10)); } },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn} className="rounded-xl border px-3 py-2 text-xs hover:opacity-80" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg, color: "#6B7280" }}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} /></div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : dados ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { icon: DollarSign,    label: "Comissão Total",   value: fmt(dados.kpis.comissao_total),          color: C.esmeralda },
              { icon: Percent,       label: "% Comissão Médio", value: fmtPct(dados.kpis.pct_comissao_medio),   color: "#059669"   },
              { icon: TrendingDown,  label: "Desconto Total",   value: fmt(dados.kpis.desconto_total),          color: "#D97706"   },
              { icon: Award,         label: "% Desconto Médio", value: fmtPct(dados.kpis.pct_desconto_medio),   color: "#7C3AED"   },
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

          {/* Destaques */}
          {destaques && destaques.maiorComissao && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              {[
                { label: "Maior Comissão R$", nome: destaques.maiorComissao?.vendedor_nome, valor: fmt(destaques.maiorComissao?.comissao_total ?? 0), color: C.esmeralda },
                { label: "Maior % Comissão",  nome: destaques.maiorPct?.vendedor_nome,     valor: fmtPct(destaques.maiorPct?.pct_comissao_medio ?? 0), color: "#059669" },
                { label: "Maior % Desconto",  nome: destaques.maiorDesconto?.vendedor_nome, valor: fmtPct(destaques.maiorDesconto?.pct_desconto_medio ?? 0), color: "#D97706" },
              ].map(({ label, nome, valor, color }) => (
                <div key={label} className="rounded-xl border p-3 flex items-center gap-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "20" }}>
                    <Award size={14} style={{ color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{label}</p>
                    <p className="text-xs font-semibold truncate" style={{ color: "#1A1A1A" }}>{nome?.split(" ")[0] ?? "—"}</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color }}>{valor}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 rounded-xl border p-1" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            {([["vendedoras", "Por Consultora"], ["itens", "Itens Detalhados"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setAba(key)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: aba === key ? C.esmeralda : "transparent", color: aba === key ? C.creme : "#6B7280" }}>
                {label}
              </button>
            ))}
          </div>

          {aba === "vendedoras" ? (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Consultora", "Vendas", "Faturamento", "Comissão R$", "% Comissão", "Desconto R$", "% Desconto"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.por_vendedora.map(v => (
                      <tr key={v.vendedor_id} className="border-t hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#1A1A1A" }}>{v.vendedor_nome.split(" ")[0]}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "#6B7280" }}>{v.qtd_vendas}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(v.total_venda)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: "#059669" }}>{fmt(v.comissao_total)}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#059669" }}>{fmtPct(v.pct_comissao_medio)}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#D97706" }}>{fmt(v.desconto_total)}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#D97706" }}>{fmtPct(v.pct_desconto_medio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.por_vendedora.length === 0 && <p className="text-center text-sm py-8" style={{ color: "#9CA3AF" }}>Nenhuma comissão no período</p>}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Produto", "SKU", "Consultora", "Pedido", "Data", "Qtd", "% Desc", "% Com", "Comissão"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.itens.map((i, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2.5 max-w-[140px] truncate" style={{ color: "#1A1A1A" }}>{i.nome_produto}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>{i.sku ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{i.vendedor_nome.split(" ")[0]}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: C.esmeralda }}>{i.numero_venda}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{fmtDate(i.data_venda)}</td>
                        <td className="px-3 py-2.5 text-center tabular-nums" style={{ color: "#6B7280" }}>{i.quantidade}</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#D97706" }}>{i.pct_desconto.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "#059669" }}>{i.pct_comissao.toFixed(1)}%</td>
                        <td className="px-3 py-2.5 tabular-nums font-bold" style={{ color: "#059669" }}>{fmt(i.valor_comissao)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.itens.length === 0 && <p className="text-center text-sm py-8" style={{ color: "#9CA3AF" }}>Nenhum item com comissão no período</p>}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
