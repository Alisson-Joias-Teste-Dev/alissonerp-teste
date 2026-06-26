"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Truck, Package, PackageCheck } from "lucide-react";

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
function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(String(d).includes("T") ? d : d + "T12:00:00");
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

interface VendaFrete {
  id: number; numero_venda: string; data_venda: string;
  total_venda: number; total_frete: number; forma_frete: string | null;
  situacao: string; cliente_nome: string | null; vendedor_nome: string | null;
}
interface Entrega {
  id: number; numero_venda: string; data_venda: string; data_entrega: string | null;
  total_venda: number; total_frete: number; situacao: string;
  cliente_nome: string | null; vendedor_nome: string | null;
}
interface Dados {
  resumo: { frete_total: number; qtd_com_frete: number; qtd_total: number; pct_com_frete: number };
  vendas_com_frete: VendaFrete[];
  entregas: Entrega[];
}

export default function AnaliseFreteClient({ podeGerenciar }: { podeGerenciar: boolean }) {
  const now = new Date();
  const [inicio, setInicio] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  const [fim,    setFim]    = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [dados,   setDados]   = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [aba,     setAba]     = useState<"frete" | "entregas">("frete");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/analise-frete?inicio=${inicio}&fim=${fim}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDados(await res.json() as Dados);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [inicio, fim]);

  useEffect(() => { load(); }, [load]);

  const situacaoLabel: Record<string, string> = {
    aprovado: "Aprovado", enviado: "Enviado", confirmado: "Confirmado",
    concluido: "Concluído", cancelado: "Cancelado", rascunho: "Rascunho",
  };
  const situacaoColor: Record<string, string> = {
    aprovado: "#2563EB", enviado: "#D97706", confirmado: "#7C3AED",
    concluido: "#059669", cancelado: "#EF4444", rascunho: "#9CA3AF",
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Análise de Frete
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Fretes e controle de entregas</p>
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
          {/* Cards resumo */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { icon: Truck,       label: "Frete Cobrado",      value: fmt(dados.resumo.frete_total),            color: C.esmeralda },
              { icon: Package,     label: "Vendas com Frete",    value: String(dados.resumo.qtd_com_frete),       color: "#2563EB"   },
              { icon: PackageCheck,label: "% com Frete",         value: dados.resumo.pct_com_frete + "%",         color: "#7C3AED"   },
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

          {/* Tabs */}
          <div className="flex gap-1 mb-4 rounded-xl border p-1" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
            {([["frete", "Vendas com Frete"], ["entregas", "Controle de Entregas"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setAba(key)}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: aba === key ? C.esmeralda : "transparent", color: aba === key ? C.creme : "#6B7280" }}>
                {label}
              </button>
            ))}
          </div>

          {aba === "frete" ? (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Pedido", "Data", "Cliente", "Consultora", "Valor Venda", "Frete", "Forma Frete", "Situação"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.vendas_com_frete.map(v => (
                      <tr key={v.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                        <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: C.esmeralda }}>
                          <Link href={`/vendas/${v.id}`} className="hover:underline">{v.numero_venda}</Link>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{fmtDate(v.data_venda)}</td>
                        <td className="px-3 py-2.5 max-w-[120px] truncate" style={{ color: "#1A1A1A" }}>{v.cliente_nome ?? "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{v.vendedor_nome?.split(" ")[0] ?? "—"}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(v.total_venda)}</td>
                        <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: "#2563EB" }}>{fmt(v.total_frete)}</td>
                        <td className="px-3 py-2.5" style={{ color: "#6B7280" }}>{v.forma_frete ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{ backgroundColor: (situacaoColor[v.situacao] ?? "#9CA3AF") + "20", color: situacaoColor[v.situacao] ?? "#9CA3AF" }}>
                            {situacaoLabel[v.situacao] ?? v.situacao}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dados.vendas_com_frete.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: "#9CA3AF" }}>Nenhuma venda com frete no período</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ backgroundColor: C.cremeBg }}>
                    <tr>
                      {["Pedido", "Venda", "Previsão Entrega", "Cliente", "Consultora", "Valor", "Situação"].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.entregas.map(e => {
                      const hoje = new Date().toISOString().slice(0,10);
                      const atrasado = e.data_entrega && e.data_entrega < hoje && e.situacao !== "concluido";
                      return (
                        <tr key={e.id} className="border-t hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                          <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: C.esmeralda }}>
                            <Link href={`/vendas/${e.id}`} className="hover:underline">{e.numero_venda}</Link>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{fmtDate(e.data_venda)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap font-semibold" style={{ color: atrasado ? "#EF4444" : "#6B7280" }}>
                            {e.data_entrega ? fmtDate(e.data_entrega) : "—"}
                            {atrasado && <span className="ml-1 text-[10px]">⚠️</span>}
                          </td>
                          <td className="px-3 py-2.5 max-w-[120px] truncate" style={{ color: "#1A1A1A" }}>{e.cliente_nome ?? "—"}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#6B7280" }}>{e.vendedor_nome?.split(" ")[0] ?? "—"}</td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold" style={{ color: C.esmeralda }}>{fmt(e.total_venda)}</td>
                          <td className="px-3 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ backgroundColor: (situacaoColor[e.situacao] ?? "#9CA3AF") + "20", color: situacaoColor[e.situacao] ?? "#9CA3AF" }}>
                              {situacaoLabel[e.situacao] ?? e.situacao}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {dados.entregas.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: "#9CA3AF" }}>Nenhuma entrega pendente no período</p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
