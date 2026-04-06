"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, RefreshCw, Loader2, Plus, TrendingUp,
  ShoppingBag, DollarSign, ChevronRight, Trophy,
  ChevronLeft,
} from "lucide-react";
import Link from "next/link";

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// ─── Situação config ─────────────────────────────────────────────────────────
const SITUACAO: Record<string, { label: string; bg: string; color: string }> = {
  rascunho:  { label: "Rascunho",  bg: "#F3F4F6", color: "#6B7280" },
  aprovado:  { label: "Aprovado",  bg: "#ECFDF5", color: "#059669" },
  enviado:   { label: "Enviado",   bg: "#EFF6FF", color: "#2563EB" },
  cancelado: { label: "Cancelado", bg: "#FEF2F2", color: "#DC2626" },
  concluido: { label: "Concluído", bg: "#F0FDF4", color: "#16A34A" },
};

const TABS = [
  { key: "",          label: "Todos"     },
  { key: "rascunho",  label: "Rascunho"  },
  { key: "aprovado",  label: "Aprovado"  },
  { key: "enviado",   label: "Enviado"   },
  { key: "concluido", label: "Concluído" },
  { key: "cancelado", label: "Cancelado" },
];

// ─── Roles com acesso total ──────────────────────────────────────────────────
const FULL_ACCESS = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "financeiro"];

// ─── Types ───────────────────────────────────────────────────────────────────
interface VendaERP {
  id:             number;
  numero_venda:   string;
  cliente_id:     number | null;
  cliente_nome:   string | null;
  vendedor_id:    number | null;
  vendedor_nome:  string | null;
  data_venda:     string;
  data_entrega:   string | null;
  total_produtos: number;
  total_desconto: number;
  total_frete:    number;
  total_venda:    number;
  total_comissao: number;
  situacao:       string;
  bloqueado:      boolean;
  qtd_itens:      number;
  total_pago:     number;
}

interface Vendedor {
  id_vendedor: number;
  nome:        string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function hoje() { return toYMD(new Date()); }
function menosNDias(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return toYMD(d);
}
function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  const date = new Date(String(d).includes("T") ? d : d + "T12:00:00");
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  role:        string;
  vendedorId:  number | null;
  nomeUsuario: string;
}

type Preset = "today" | "7d" | "30d" | "mes" | "custom";

// ─── Component ───────────────────────────────────────────────────────────────
export default function VendasClient({ role, vendedorId, nomeUsuario }: Props) {
  const router       = useRouter();
  const isFullAccess = FULL_ACCESS.includes(role);

  // Período
  const [preset, setPreset] = useState<Preset>("30d");
  const [inicio, setInicio] = useState(() => menosNDias(30));
  const [fim,    setFim]    = useState(() => hoje());
  const nowDate = new Date();
  const [mesSel, setMesSel] = useState(
    `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`
  );

  // Filtros
  const [tabSituacao,   setTabSituacao]   = useState("");
  const [busca,         setBusca]         = useState("");
  const [vendedorFiltro, setVendedorFiltro] = useState<number | "">(
    isFullAccess ? "" : (vendedorId ?? "")
  );

  // Dados
  const [vendas,     setVendas]     = useState<VendaERP[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Carregar vendedores (apenas acesso total)
  useEffect(() => {
    if (!isFullAccess) return;
    fetch("/api/vendedores")
      .then(r => r.json())
      .then(setVendedores)
      .catch(() => {});
  }, [isFullAccess]);

  // Fetch vendas
  const fetchVendas = useCallback(async (ini: string, fi: string, vId?: number | "") => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ inicio: ini, fim: fi });
      if (tabSituacao) params.set("situacao", tabSituacao);
      const vid = vId !== undefined ? vId : vendedorFiltro;
      if (vid) params.set("vendedor_id", String(vid));

      const res  = await fetch(`/api/vendas?${params}`);
      const body = await res.json() as VendaERP[] | { error: string };
      if (!res.ok) throw new Error((body as { error: string }).error ?? `HTTP ${res.status}`);
      setVendas(body as VendaERP[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }, [tabSituacao, vendedorFiltro]);

  // Carregar ao montar + quando tab muda
  useEffect(() => {
    fetchVendas(inicio, fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabSituacao]);

  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 15;

  // Filtro local
  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return vendas.filter(v => {
      if (!q) return true;
      return (
        v.numero_venda?.toLowerCase().includes(q) ||
        v.cliente_nome?.toLowerCase().includes(q) ||
        v.vendedor_nome?.toLowerCase().includes(q)
      );
    });
  }, [vendas, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual  = Math.min(pagina, totalPaginas);
  const visiveis     = filtradas.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  // Reset página ao filtrar
  useEffect(() => { setPagina(1); }, [busca, tabSituacao, vendedorFiltro]);

  // Stats
  const stats = useMemo(() => ({
    count:     filtradas.length,
    faturado:  filtradas.reduce((s, v) => s + v.total_venda,    0),
    comissao:  filtradas.reduce((s, v) => s + v.total_comissao, 0),
    pago:      filtradas.reduce((s, v) => s + v.total_pago,     0),
  }), [filtradas]);

  function applyPreset(p: Preset, mes?: string) {
    let ini = inicio, fi = fim;
    if (p === "today") { ini = hoje();         fi = hoje(); }
    if (p === "7d")    { ini = menosNDias(7);  fi = hoje(); }
    if (p === "30d")   { ini = menosNDias(30); fi = hoje(); }
    if (p === "mes") {
      const ref = mes ?? mesSel;
      const [y, m] = ref.split("-").map(Number);
      ini = `${y}-${String(m).padStart(2, "0")}-01`;
      fi  = new Date(y, m, 0).toISOString().slice(0, 10);
    }
    setPreset(p); setInicio(ini); setFim(fi);
    fetchVendas(ini, fi);
  }

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Vendas
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
            {isFullAccess ? "Todas as vendas ERP" : `Minhas vendas — ${nomeUsuario}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFullAccess && (
            <Link
              href="/vendas/ranking"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-opacity hover:opacity-80"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            >
              <Trophy size={14} />
              Ranking
            </Link>
          )}
          <Link
            href="/vendas/nova"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            <Plus size={15} strokeWidth={2.5} />
            Nova Venda
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { icon: ShoppingBag,  label: "Vendas",    value: String(stats.count),       mono: false },
          { icon: TrendingUp,   label: "Faturado",  value: fmt(stats.faturado),        mono: true  },
          { icon: DollarSign,   label: "Comissão",  value: fmt(stats.comissao),        mono: true  },
          { icon: DollarSign,   label: "Recebido",  value: fmt(stats.pago),            mono: true  },
        ].map(({ icon: Icon, label, value, mono }) => (
          <div
            key={label}
            className="rounded-xl p-3 border"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} style={{ color: "#9CA3AF" }} />
              <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: "#9CA3AF" }}>
                {label}
              </span>
            </div>
            <p
              className={`text-base font-semibold ${mono ? "tabular-nums" : ""}`}
              style={{ color: C.esmeralda }}
            >
              {loading ? <span className="text-gray-300">—</span> : value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Período ── */}
      <div
        className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        {(["today", "7d", "30d", "mes", "custom"] as Preset[]).map(p => {
          const labels: Record<Preset, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", mes: "Mês", custom: "Período" };
          return (
            <button
              key={p}
              onClick={() => (p === "custom" || p === "mes") ? setPreset(p) : applyPreset(p)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: preset === p ? C.esmeraldaLt : "transparent",
                border: `1px solid ${preset === p ? C.esmeralda : C.cremeBorder}`,
                color: preset === p ? C.esmeralda : "#6B7280",
              }}
            >
              {labels[p]}
            </button>
          );
        })}

        {preset === "mes" && (
          <div className="flex items-center gap-1.5">
            <input
              type="month"
              value={mesSel}
              onChange={e => {
                setMesSel(e.target.value);
                applyPreset("mes", e.target.value);
              }}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }}
            />
          </div>
        )}

        {preset === "custom" && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }} />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>até</span>
            <input type="date" value={fim} onChange={e => setFim(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A" }} />
            <button
              onClick={() => fetchVendas(inicio, fim)}
              disabled={loading}
              className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >Aplicar</button>
          </div>
        )}

        <button
          onClick={() => fetchVendas(inicio, fim)}
          disabled={loading}
          className="ml-auto p-1.5 rounded-lg hover:opacity-70 disabled:opacity-40 transition-opacity"
          style={{ border: `1px solid ${C.cremeBorder}`, color: "#9CA3AF" }}
          title="Atualizar"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} strokeWidth={1.75} />}
        </button>
      </div>

      {/* ── Tabs situação ── */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTabSituacao(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: tabSituacao === t.key ? C.esmeralda : "transparent",
              color: tabSituacao === t.key ? C.creme : "#6B7280",
              border: `1px solid ${tabSituacao === t.key ? C.esmeralda : C.cremeBorder}`,
            }}
          >
            {t.label}
            {t.key !== "" && (
              <span className="ml-1.5 text-[10px] opacity-70">
                {vendas.filter(v => v.situacao === t.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Busca + Vendedor ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-40 border"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <Search size={13} style={{ color: "#9CA3AF" }} />
          <input
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: "#1A1A1A" }}
            placeholder="Buscar número, cliente, vendedor..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {isFullAccess && (
          <select
            className="rounded-lg px-3 py-2 text-sm outline-none border"
            style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: "#374151" }}
            value={vendedorFiltro}
            onChange={e => {
              const v = e.target.value === "" ? "" : Number(e.target.value);
              setVendedorFiltro(v);
              fetchVendas(inicio, fim, v);
            }}
          >
            <option value="">Todas as vendedoras</option>
            {vendedores.map(v => (
              <option key={v.id_vendedor} value={v.id_vendedor}>{v.nome}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Nº Venda", "Data", "Cliente", "Vendedor", "Itens", "Total", "Recebido", "Situação", ""].map(h => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#9CA3AF" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={16} className="animate-spin inline-block mr-2" />
                    Carregando...
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center" style={{ color: "#9CA3AF" }}>
                    <ShoppingBag size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhuma venda no período</p>
                    {isFullAccess && (
                      <Link
                        href="/vendas/nova"
                        className="inline-flex items-center gap-1 mt-3 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}
                      >
                        <Plus size={14} /> Nova Venda
                      </Link>
                    )}
                  </td>
                </tr>
              ) : (
                visiveis.map((v, i) => {
                  const sit = SITUACAO[v.situacao] ?? { label: v.situacao, bg: "#F3F4F6", color: "#6B7280" };
                  const saldo = v.total_venda - v.total_pago;
                  return (
                    <tr
                      key={v.id}
                      className="hover:bg-stone-50 transition-colors cursor-pointer"
                      style={{ borderTop: i > 0 ? `1px solid ${C.creme}` : undefined }}
                      onClick={() => router.push(`/vendas/${v.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: C.esmeralda }}>
                        {v.numero_venda}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs tabular-nums" style={{ color: "#9CA3AF" }}>
                        {fmtDate(v.data_venda)}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]" style={{ color: "#374151" }}>
                        <p className="truncate text-xs">{v.cliente_nome ?? <span style={{ color: "#9CA3AF" }}>—</span>}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[120px]" style={{ color: "#374151" }}>
                        <p className="truncate text-xs">{v.vendedor_nome ?? <span style={{ color: "#9CA3AF" }}>—</span>}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs tabular-nums" style={{ color: "#6B7280" }}>
                        {v.qtd_itens}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs font-medium whitespace-nowrap" style={{ color: "#374151" }}>
                        {fmt(v.total_venda)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs whitespace-nowrap">
                        <span style={{ color: v.total_pago >= v.total_venda ? "#059669" : saldo > 0 ? "#D97706" : "#9CA3AF" }}>
                          {fmt(v.total_pago)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
                          style={{ backgroundColor: sit.bg, color: sit.color }}
                        >
                          {sit.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/vendas/${v.id}`}
                          className="p-1 rounded hover:bg-gray-100 transition-colors inline-flex"
                          style={{ color: "#9CA3AF" }}
                          onClick={e => e.stopPropagation()}
                        >
                          <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtradas.length > 0 && (
          <div
            className="px-4 py-2.5 flex items-center justify-between gap-3"
            style={{ borderTop: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
          >
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
              {filtradas.length} venda{filtradas.length !== 1 ? "s" : ""}
              {" · "}pág. {paginaAtual} de {totalPaginas}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={paginaAtual === 1}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={paginaAtual === totalPaginas}
                className="p-1.5 rounded-lg border transition-opacity disabled:opacity-30 hover:opacity-70"
                style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
