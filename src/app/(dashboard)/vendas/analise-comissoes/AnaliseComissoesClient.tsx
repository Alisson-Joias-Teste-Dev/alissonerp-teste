"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, RefreshCw, Search, Calendar,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface KPIs {
  comissao_total: number; desconto_total: number; faturamento: number;
  valor_bruto: number; pct_comissao_medio: number; pct_desconto_medio: number;
  comissao_retida: number;
}
interface Vendedora {
  vendedor_id: number; vendedor_nome: string; qtd_vendas: number;
  comissao_total: number; comissao_perdida: number; desconto_total: number;
  total_realizado: number; total_desejado: number;
  pct_comissao_medio: number; pct_desconto_medio: number;
}
interface Item {
  item_id: number; nome_produto: string; sku: string | null; quantidade: number;
  preco_lista: number; preco_unitario: number; total_item: number;
  pct_desconto: number; pct_comissao: number; valor_comissao: number;
  numero_venda: string; data_venda: string; vendedor_nome: string; vendedor_id: number;
}

function fmt(v: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v); }
function fmtPct(v: number) { return v.toFixed(2) + "%"; }
function fmtDate(d: string) {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T12:00:00");
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
}

function hoje() { return new Date().toISOString().slice(0, 10); }
function primeiroDiaMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

interface Props { podeGerenciar: boolean; vendedorId: number | null; }

type SortField = "nome" | "desejado" | "realizado" | "desconto" | "comissao_media" | "comissao_ganha" | "comissao_perdida";

export default function AnaliseComissoesClient({ podeGerenciar, vendedorId }: Props) {
  void podeGerenciar; void vendedorId;

  const [inicio,  setInicio]  = useState(primeiroDiaMes);
  const [fim,     setFim]     = useState(hoje);
  const [kpis,    setKpis]    = useState<KPIs | null>(null);
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([]);
  const [itens,   setItens]   = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Filtros itens
  const [filtroVendedor, setFiltroVendedor] = useState<number | "">("");
  const [filtroPedido,   setFiltroPedido]   = useState("");
  const [pagina,         setPagina]         = useState(1);
  const itensPorPagina = 50;

  // Sort vendedoras
  const [sortField, setSortField] = useState<SortField>("comissao_ganha");
  const [sortDir,   setSortDir]   = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/analise-comissoes?inicio=${inicio}&fim=${fim}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setKpis(data.kpis);
      setVendedoras(data.por_vendedora);
      setItens(data.itens);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }, [inicio, fim]);

  useEffect(() => { load(); }, [load]);

  // Highlight cards
  const topComissaoMedia = useMemo(() => vendedoras.length ? vendedoras.reduce((a, b) => a.pct_comissao_medio > b.pct_comissao_medio ? a : b) : null, [vendedoras]);
  const topComissaoValor = useMemo(() => vendedoras.length ? vendedoras.reduce((a, b) => a.comissao_total > b.comissao_total ? a : b) : null, [vendedoras]);
  const topDesconto      = useMemo(() => vendedoras.length ? vendedoras.reduce((a, b) => a.pct_desconto_medio > b.pct_desconto_medio ? a : b) : null, [vendedoras]);
  const topPerdida       = useMemo(() => vendedoras.length ? vendedoras.reduce((a, b) => a.comissao_perdida > b.comissao_perdida ? a : b) : null, [vendedoras]);

  // Sort vendedoras
  function toggleSort(f: SortField) {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  }
  const sortedVendedoras = useMemo(() => {
    return [...vendedoras].sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "nome": return sortDir === "asc" ? a.vendedor_nome.localeCompare(b.vendedor_nome) : b.vendedor_nome.localeCompare(a.vendedor_nome);
        case "desejado": va = a.total_desejado; vb = b.total_desejado; break;
        case "realizado": va = a.total_realizado; vb = b.total_realizado; break;
        case "desconto": va = a.pct_desconto_medio; vb = b.pct_desconto_medio; break;
        case "comissao_media": va = a.pct_comissao_medio; vb = b.pct_comissao_medio; break;
        case "comissao_ganha": va = a.comissao_total; vb = b.comissao_total; break;
        case "comissao_perdida": va = a.comissao_perdida; vb = b.comissao_perdida; break;
        default: va = 0; vb = 0;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [vendedoras, sortField, sortDir]);

  // Filtro itens
  const itensFiltrados = useMemo(() => {
    setPagina(1);
    return itens.filter(i => {
      if (filtroVendedor && i.vendedor_id !== filtroVendedor) return false;
      if (filtroPedido && !i.numero_venda.toLowerCase().includes(filtroPedido.toLowerCase())) return false;
      return true;
    });
  }, [itens, filtroVendedor, filtroPedido]);

  const totalPaginas = Math.ceil(itensFiltrados.length / itensPorPagina);
  const itensPaginados = itensFiltrados.slice((pagina - 1) * itensPorPagina, pagina * itensPorPagina);

  // Totais rodapé itens
  const totaisItens = useMemo(() => {
    const bruto = itensFiltrados.reduce((s, i) => s + i.preco_lista * i.quantidade, 0);
    const liquido = itensFiltrados.reduce((s, i) => s + i.total_item, 0);
    const comissao = itensFiltrados.reduce((s, i) => s + i.valor_comissao, 0);
    const descMedio = bruto > 0 ? ((bruto - liquido) / bruto) * 100 : 0;
    const comMedio = liquido > 0 ? (comissao / liquido) * 100 : 0;
    const retida = bruto > 0 ? (bruto * 0.04) - comissao : 0;
    return { bruto, liquido, descMedio, comMedio, comissao, retida: Math.max(0, retida) };
  }, [itensFiltrados]);

  const vendedoresUnicos = useMemo(() => {
    const map = new Map<number, string>();
    itens.forEach(i => map.set(i.vendedor_id, i.vendedor_nome));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [itens]);

  const SH = ({ f, l }: { f: SortField; l: string }) => (
    <th className="px-3 py-2.5 text-xs font-semibold cursor-pointer select-none whitespace-nowrap"
      style={{ color: "#6B7280" }} onClick={() => toggleSort(f)}>
      {l} <span className="opacity-40">↕</span>
    </th>
  );

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              Análise de Comissões
            </h2>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>Visualize o desempenho de comissões das consultoras</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border rounded-lg px-2 py-1.5" style={{ borderColor: C.cremeBorder }}>
            <Calendar size={13} style={{ color: "#9CA3AF" }} />
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
              className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>-</span>
            <input type="date" value={fim} onChange={e => setFim(e.target.value)}
              className="text-xs outline-none bg-transparent" style={{ color: C.esmeralda }} />
          </div>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40" style={{ color: "#6B7280" }}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} /></div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : kpis && (
        <>
          {/* ── Highlight Cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "MAIOR COMISSÃO MÉDIA", vendedora: topComissaoMedia, value: fmtPct(topComissaoMedia?.pct_comissao_medio ?? 0), bg: "#fff" },
              { label: "MAIOR COMISSÃO (R$)", vendedora: topComissaoValor, value: fmt(topComissaoValor?.comissao_total ?? 0), bg: "#ECFDF5" },
              { label: "MAIOR DESCONTO MÉDIO", vendedora: topDesconto, value: fmtPct(topDesconto?.pct_desconto_medio ?? 0), bg: "#FEF9C3" },
              { label: "MAIOR COMISSÃO PERDIDA", vendedora: topPerdida, value: fmt(topPerdida?.comissao_perdida ?? 0), bg: "#FEF2F2" },
            ].map(card => (
              <div key={card.label} className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, backgroundColor: card.bg }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>{card.label}</p>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                    {card.vendedora?.vendedor_nome.split(" ").map(n => n[0]).slice(0, 2).join("") ?? "—"}
                  </div>
                  <span className="text-xs font-medium truncate" style={{ color: "#374151" }}>
                    {card.vendedora?.vendedor_nome ?? "—"}
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums" style={{ color: C.esmeralda }}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* ── Detalhamento por Consultora ─────────────────────────────── */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="px-4 py-3 bg-white">
              <h3 className="text-sm font-bold" style={{ color: "#374151" }}>Detalhamento por Consultora</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: C.cremeBg }}>
                  <tr>
                    <SH f="nome" l="Consultora" />
                    <SH f="desejado" l="Total Desejado" />
                    <SH f="realizado" l="Total Realizado" />
                    <SH f="desconto" l="Média Desconto" />
                    <SH f="comissao_media" l="Média Comissão" />
                    <SH f="comissao_ganha" l="Comissão Ganha" />
                    <SH f="comissao_perdida" l="Comissão Perdida" />
                  </tr>
                </thead>
                <tbody>
                  {sortedVendedoras.map(v => (
                    <tr key={v.vendedor_id} className="border-t" style={{ borderColor: C.cremeBorder }}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                            {v.vendedor_nome.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                          <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{v.vendedor_nome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(v.total_desejado)}</td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(v.total_realizado)}</td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmtPct(v.pct_desconto_medio)}</td>
                      <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmtPct(v.pct_comissao_medio)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-sm font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmt(v.comissao_total)}</span>
                        <p className="text-[10px] tabular-nums" style={{ color: "#059669" }}>{fmt(v.comissao_total / 2)}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: "#EF4444" }}>{fmt(v.comissao_perdida)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Detalhamento por Item ───────────────────────────────────── */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="px-4 py-3 bg-white">
              <h3 className="text-sm font-bold" style={{ color: "#374151" }}>Detalhamento por Item</h3>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "#9CA3AF" }}>Consultora</label>
                  <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value ? Number(e.target.value) : "")}
                    className="border rounded-lg px-2 py-1.5 text-xs outline-none" style={{ borderColor: C.cremeBorder }}>
                    <option value="">Todas as consultoras</option>
                    {vendedoresUnicos.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] block mb-0.5" style={{ color: "#9CA3AF" }}>Buscar por Nº Pedido</label>
                  <div className="flex items-center gap-1 border rounded-lg px-2 py-1.5" style={{ borderColor: C.cremeBorder }}>
                    <Search size={12} style={{ color: "#9CA3AF" }} />
                    <input type="text" value={filtroPedido} onChange={e => setFiltroPedido(e.target.value)}
                      placeholder="Digite o número..."
                      className="text-xs outline-none bg-transparent w-32" style={{ color: "#374151" }} />
                  </div>
                </div>
                <span className="text-xs ml-auto" style={{ color: "#9CA3AF" }}>{itensFiltrados.length} itens encontrados</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: C.cremeBg }}>
                  <tr>
                    {["Data", "Nº Pedido", "Consultor", "SKU", "QTD.", "Preç. UN", "Preço Cheio", "Preço Vendido", "Desc. (%)", "Comissão (%)"].map(h => (
                      <th key={h} className="px-2 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "#6B7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {itensPaginados.map(i => (
                    <tr key={`${i.item_id}`} className="border-t" style={{ borderColor: C.cremeBorder }}>
                      <td className="px-2 py-2 tabular-nums" style={{ color: "#6B7280" }}>{fmtDate(i.data_venda)}</td>
                      <td className="px-2 py-2 font-medium" style={{ color: "#374151" }}>#{i.numero_venda}</td>
                      <td className="px-2 py-2" style={{ color: "#374151" }}>{i.vendedor_nome}</td>
                      <td className="px-2 py-2 font-mono" style={{ color: "#6B7280" }}>{i.sku ?? "—"}</td>
                      <td className="px-2 py-2 text-center" style={{ color: "#374151" }}>{i.quantidade}</td>
                      <td className="px-2 py-2 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(i.preco_unitario)}</td>
                      <td className="px-2 py-2 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(i.preco_lista)}</td>
                      <td className="px-2 py-2 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(i.total_item)}</td>
                      <td className="px-2 py-2 text-right tabular-nums" style={{ color: i.pct_desconto > 25 ? "#EF4444" : "#374151" }}>{fmtPct(i.pct_desconto)}</td>
                      <td className="px-2 py-2 text-right tabular-nums" style={{ color: "#374151" }}>{fmtPct(i.pct_comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t" style={{ borderColor: C.cremeBorder }}>
                <span className="text-xs" style={{ color: "#9CA3AF" }}>
                  {((pagina - 1) * itensPorPagina) + 1}–{Math.min(pagina * itensPorPagina, itensFiltrados.length)} de {itensFiltrados.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}
                    className="px-2 py-1 rounded text-xs font-medium disabled:opacity-30" style={{ color: C.esmeralda }}>
                    ← Anterior
                  </button>
                  {Array.from({ length: Math.min(totalPaginas, 7) }, (_, i) => {
                    let p: number;
                    if (totalPaginas <= 7) p = i + 1;
                    else if (pagina <= 4) p = i + 1;
                    else if (pagina >= totalPaginas - 3) p = totalPaginas - 6 + i;
                    else p = pagina - 3 + i;
                    return (
                      <button key={p} onClick={() => setPagina(p)}
                        className="w-7 h-7 rounded text-xs font-medium"
                        style={{
                          backgroundColor: p === pagina ? C.esmeralda : "transparent",
                          color: p === pagina ? C.creme : "#6B7280",
                        }}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
                    className="px-2 py-1 rounded text-xs font-medium disabled:opacity-30" style={{ color: C.esmeralda }}>
                    Próxima →
                  </button>
                </div>
              </div>
            )}

            {/* Rodapé totais */}
            <div className="px-4 py-3 border-t grid grid-cols-3 md:grid-cols-6 gap-3" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Valor Bruto</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#374151" }}>{fmt(totaisItens.bruto)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Valor Líquido</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#374151" }}>{fmt(totaisItens.liquido)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Desconto Médio (%)</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#374151" }}>{fmtPct(totaisItens.descMedio)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Comissão Média (%)</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#374151" }}>{fmtPct(totaisItens.comMedio)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Comissão Total</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmt(totaisItens.comissao)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase" style={{ color: "#9CA3AF" }}>Comissão Retida</p>
                <p className="text-sm font-bold tabular-nums" style={{ color: "#EF4444" }}>{fmt(totaisItens.retida)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
