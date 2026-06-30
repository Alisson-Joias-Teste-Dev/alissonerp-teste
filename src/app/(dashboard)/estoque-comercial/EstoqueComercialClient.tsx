"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, AlertTriangle, CheckCircle, Search,
  RefreshCw, Loader2, X, ClipboardList, ClipboardCheck, ScanLine, Printer,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ItemEstoque {
  produto_id:          number;
  nome_produto:        string;
  sku:                 string | null;
  categoria:           string | null;
  saldo_fisico:        number;
  reservado:           number;
  disponivel:          number;
  em_transito:         number;
  estoque_minimo:      number;
  ativo:               boolean;
  config_id:           number | null;
  total_movimentacoes: number;
  alerta:              "ok" | "no_minimo" | "abaixo_minimo" | "zerado" | "negativo";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ALERTA_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ok:            { bg: "#D1FAE5", text: "#065F46", label: "OK"            },
  no_minimo:     { bg: "#FEF3C7", text: "#92400E", label: "No mínimo"     },
  abaixo_minimo: { bg: "#FEE2E2", text: "#991B1B", label: "Abaixo mín."  },
  zerado:        { bg: "#F3F4F6", text: "#6B7280", label: "Zerado"        },
  negativo:      { bg: "#FCA5A5", text: "#7F1D1D", label: "Negativo"     },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EstoqueComercialClient() {
  const router = useRouter();
  const [items,     setItems]   = useState<ItemEstoque[]>([]);
  const [loading,   setLoading] = useState(true);
  const [search,    setSearch]  = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/estoque-comercial");
      if (r.ok) setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = items.filter(i =>
    !search ||
    i.nome_produto.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const totalProdutos    = items.length;
  const alertaZerado     = items.filter(i => i.alerta === "zerado" || i.alerta === "negativo").length;
  const alertaBaixo      = items.filter(i => i.alerta === "abaixo_minimo").length;
  const totalDisponivel  = items.reduce((s, i) => s + i.disponivel, 0);
  const totalReservado   = items.reduce((s, i) => s + i.reservado, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Estoque Comercial
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Controle de produtos acabados para venda</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/rfid/testar")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            style={{ color: "#184036" }}
            title="Imprimir etiqueta RFID"
          >
            <Printer size={15} />
            <span className="hidden sm:inline">Etiqueta</span>
          </button>
          <button
            onClick={() => router.push("/estoque-comercial/entrada-scanner")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            style={{ color: "#184036" }}
            title="Entrada por scanner"
          >
            <ScanLine size={15} />
            <span className="hidden sm:inline">Scanner</span>
          </button>
          <button
            onClick={() => router.push("/estoque-comercial/inventario")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            style={{ color: "#184036" }}
            title="Inventario"
          >
            <ClipboardList size={15} />
            <span className="hidden sm:inline">Inventario</span>
           </button>
          <button
            onClick={() => router.push("/estoque-comercial/auditoria")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            style={{ color: "#184036" }}
            title="Auditoria"
          >
            <ClipboardCheck size={15} />
            <span className="hidden sm:inline">Auditoria</span>
          </button>
          <button
            onClick={fetchData}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Produtos",     value: totalProdutos,   icon: Package,       color: "#184036" },
          { label: "Disponivel",   value: totalDisponivel, icon: CheckCircle,   color: "#059669" },
          { label: "Reservado",    value: totalReservado,  icon: Package,       color: "#2563EB" },
          { label: "Zerados",      value: alertaZerado,    icon: X,             color: "#6B7280" },
          { label: "Abaixo min.",  value: alertaBaixo,     icon: AlertTriangle, color: "#DC2626" },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-4"
            style={{ background: "#FAFAF7", border: "1px solid #E8DCC8" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon size={14} style={{ color: stat.color }} />
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border rounded-xl pl-8 pr-3 py-2 text-sm outline-none"
          style={{ borderColor: "#E8DCC8" }}
          placeholder="Buscar por nome ou SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Package size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">
            {search ? "Nenhum produto encontrado." : "Nenhum produto no estoque comercial."}
          </p>
          {!search && (
            <p className="text-xs text-gray-400 mt-1">Use o inventário para ajustar o estoque.</p>
          )}
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid #E8DCC8" }}
        >
          <table className="w-full text-sm">
            <thead style={{ background: "#F9F6F0" }}>
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Produto</th>
                <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Fisico</th>
                <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#2563EB" }}>Reservado</th>
                <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#059669" }}>Disponivel</th>
                <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Minimo</th>
                <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const style = ALERTA_STYLE[item.alerta] ?? ALERTA_STYLE.ok;
                return (
                  <tr
                    key={item.produto_id}
                    style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F6" }}
                  >
                    <td className="px-4 py-3">
                      <p
                        className="font-medium cursor-pointer hover:underline"
                        style={{ color: "#184036" }}
                        onClick={() => router.push(`/estoque-comercial/${item.produto_id}`)}
                      >
                        {item.nome_produto}
                      </p>
                      {item.sku && <p className="text-xs text-gray-400">{item.sku}</p>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-sm font-medium" style={{ color: "#6B7280" }}>
                        {item.saldo_fisico}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {item.reservado > 0 ? (
                        <span className="text-sm font-medium" style={{ color: "#2563EB" }}>
                          {item.reservado}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="text-lg font-bold"
                        style={{ color: item.disponivel <= 0 ? "#DC2626" : "#059669" }}
                      >
                        {item.disponivel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500 text-sm">
                      {item.estoque_minimo}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: style.bg, color: style.text }}
                      >
                        {style.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
