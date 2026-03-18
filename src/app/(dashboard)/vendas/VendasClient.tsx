"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, RefreshCw, Loader2 } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

// status integer do PDV: 1=Pendente 2=Aprovado 3=Enviado 4=Cancelado
const STATUS_LABEL: Record<number, { label: string; bg: string; color: string }> = {
  1: { label: "Pendente",  bg: "#FEF3C7", color: "#92400E" },
  2: { label: "Aprovado",  bg: "#ECFDF5", color: "#059669" },
  3: { label: "Enviado",   bg: "#EFF6FF", color: "#2563EB" },
  4: { label: "Cancelado", bg: "#FEF2F2", color: "#DC2626" },
};

interface Venda {
  id: number;
  numero_pedido: number | null;
  data_venda: string | null;
  total_venda: number;
  total_produtos: number;
  total_itens_qnt: number;
  status: number | null;
  entregue: boolean;
  observacoes: string | null;
  cliente_nome: string | null;
  cliente_cpf: string | null;
  vendedor_nome: string | null;
  vendedor_id: number | null;
}

// ─── Period helpers ────────────────────────────────────────────────────────────

function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function hoje() { return toYMD(new Date()); }
function menosNDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYMD(d);
}

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Main ──────────────────────────────────────────────────────────────────────

type Preset = "today" | "7d" | "30d" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today",  label: "Hoje" },
  { key: "7d",     label: "7 dias" },
  { key: "30d",    label: "30 dias" },
  { key: "custom", label: "Personalizado" },
];

export default function VendasClient() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [inicio, setInicio] = useState(() => menosNDias(30));
  const [fim,    setFim]    = useState(() => hoje());

  const [vendas,  setVendas]  = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const [busca,        setBusca]        = useState("");
  const [statusFiltro, setStatusFiltro] = useState<number | "todos">("todos");

  async function fetchVendas(ini: string, fi: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendas?inicio=${ini}&fim=${fi}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setVendas(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVendas(inicio, fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p: Preset) {
    let ini = inicio;
    let fi  = fim;
    if (p === "today") { ini = hoje();         fi = hoje(); }
    if (p === "7d")    { ini = menosNDias(7);  fi = hoje(); }
    if (p === "30d")   { ini = menosNDias(30); fi = hoje(); }
    setPreset(p);
    setInicio(ini);
    setFim(fi);
    fetchVendas(ini, fi);
  }

  function applyCustom() {
    setPreset("custom");
    fetchVendas(inicio, fim);
  }

  const filtradas = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return vendas.filter((v) => {
      const matchStatus = statusFiltro === "todos" || v.status === statusFiltro;
      const matchBusca =
        !q ||
        String(v.numero_pedido ?? "").includes(q) ||
        v.cliente_nome?.toLowerCase().includes(q) ||
        v.vendedor_nome?.toLowerCase().includes(q) ||
        String(v.id).includes(q);
      return matchStatus && matchBusca;
    });
  }, [vendas, busca, statusFiltro]);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <h2
          className="text-xl md:text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
        >
          Vendas
        </h2>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Consulta de vendas — somente leitura
        </p>
      </div>

      {/* Filtro de período */}
      <div
        className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        {PRESETS.map(({ key, label }) => {
          const isActive = preset === key;
          return (
            <button
              key={key}
              onClick={() => key !== "custom" ? applyPreset(key) : setPreset("custom")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "#18403620" : "transparent",
                border: `1px solid ${isActive ? C.esmeralda : C.cremeBorder}`,
                color: isActive ? C.esmeralda : "#6B7280",
              }}
            >
              {label}
            </button>
          );
        })}

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A", backgroundColor: "#fff" }}
            />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>até</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: C.cremeBorder, color: "#1A1A1A", backgroundColor: "#fff" }}
            />
            <button
              onClick={applyCustom}
              disabled={loading}
              className="px-3 py-1 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              Aplicar
            </button>
          </div>
        )}

        <button
          onClick={() => fetchVendas(inicio, fim)}
          disabled={loading}
          className="ml-auto p-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ border: `1px solid ${C.cremeBorder}`, color: "#9CA3AF" }}
          title="Atualizar"
        >
          {loading
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} strokeWidth={1.75} />
          }
        </button>
      </div>

      {/* Busca + status */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 flex-1 min-w-48 border"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
        >
          <Search size={13} style={{ color: "#9CA3AF" }} />
          <input
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: "#1A1A1A" }}
            placeholder="Buscar por pedido, cliente, vendedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg px-3 py-2 text-sm outline-none border"
          style={{ borderColor: C.cremeBorder, backgroundColor: "#fff", color: "#374151" }}
          value={statusFiltro}
          onChange={(e) =>
            setStatusFiltro(e.target.value === "todos" ? "todos" : Number(e.target.value))
          }
        >
          <option value="todos">Todos os status</option>
          <option value={1}>Pendente</option>
          <option value={2}>Aprovado</option>
          <option value={3}>Enviado</option>
          <option value={4}>Cancelado</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-lg px-4 py-3 text-sm border border-red-200 bg-red-50 text-red-700">
          {error}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
                {["Pedido", "Data", "Cliente", "Vendedor", "Itens", "Total", "Status", "Entregue"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#9CA3AF" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && vendas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#9CA3AF" }}>
                    <Loader2 size={16} className="animate-spin inline-block mr-2" />
                    Carregando...
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#9CA3AF" }}>
                    Nenhuma venda encontrada no período
                  </td>
                </tr>
              ) : (
                filtradas.map((v, i) => {
                  const st = v.status != null
                    ? (STATUS_LABEL[v.status] ?? { label: String(v.status), bg: "#F3F4F6", color: "#6B7280" })
                    : { label: "—", bg: "#F3F4F6", color: "#6B7280" };
                  return (
                    <tr
                      key={v.id}
                      style={{ borderTop: i > 0 ? `1px solid ${C.creme}` : undefined }}
                      className="hover:bg-stone-50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: C.esmeralda }}>
                        {v.numero_pedido != null ? `#${v.numero_pedido}` : `id ${v.id}`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]" style={{ color: "#9CA3AF" }}>
                        {fmtDate(v.data_venda)}
                      </td>
                      <td className="px-4 py-3 max-w-[180px] truncate" style={{ color: "#374151" }}>
                        {v.cliente_nome ?? "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[140px] truncate" style={{ color: "#374151" }}>
                        {v.vendedor_nome ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "#6B7280" }}>
                        {v.total_itens_qnt ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap" style={{ color: "#374151" }}>
                        {fmt(Number(v.total_venda))}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: st.bg, color: st.color }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            backgroundColor: v.entregue ? "#ECFDF5" : "#F3F4F6",
                            color: v.entregue ? "#059669" : "#6B7280",
                          }}
                        >
                          {v.entregue ? "Sim" : "Não"}
                        </span>
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
            className="px-4 py-2 text-[11px] text-right"
            style={{ color: "#9CA3AF", borderTop: `1px solid ${C.cremeBorder}` }}
          >
            {filtradas.length} de {vendas.length} vendas exibidas
          </div>
        )}
      </div>
    </div>
  );
}
