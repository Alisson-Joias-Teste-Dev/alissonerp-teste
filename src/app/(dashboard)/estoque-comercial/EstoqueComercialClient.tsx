"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, AlertTriangle, CheckCircle, Plus, Search,
  RefreshCw, ArrowUpCircle, ArrowDownCircle, Settings2,
  Loader2, X, ArrowRightLeft, ClipboardList,
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

interface MovModal {
  produtoId: number;
  nomeProduto: string;
  saldoAtual: number;
  tipo: "entrada" | "saida";
}

interface LocalEstoque {
  id: number;
  nome: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ALERTA_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ok:            { bg: "#D1FAE5", text: "#065F46", label: "OK"            },
  no_minimo:     { bg: "#FEF3C7", text: "#92400E", label: "No mínimo"     },
  abaixo_minimo: { bg: "#FEE2E2", text: "#991B1B", label: "Abaixo mín."  },
  zerado:        { bg: "#F3F4F6", text: "#6B7280", label: "Zerado"        },
  negativo:      { bg: "#FCA5A5", text: "#7F1D1D", label: "Negativo"     },
};

const MOTIVOS_ENTRADA = [
  { value: "producao",        label: "Produção"         },
  { value: "devolucao",       label: "Devolução"        },
  { value: "ajuste_entrada",  label: "Ajuste de entrada"},
  { value: "inventario",      label: "Inventário"       },
];

const MOTIVOS_SAIDA = [
  { value: "ajuste_saida",    label: "Ajuste de saída"  },
  { value: "inventario",      label: "Inventário"       },
];

// ─── AddProdutoModal ──────────────────────────────────────────────────────────
function AddProdutoModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<{ id_produto: number; nome: string; sku: string }[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [min,      setMin]      = useState(0);
  const [selected, setSelected] = useState<{ id_produto: number; nome: string } | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(query)}&limit=8`);
        if (r.ok) setResults(await r.json());
      } finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleAdd() {
    if (!selected) return;
    setSaving(true); setErr("");
    try {
      const r = await fetch(`/api/estoque-comercial/config/${selected.id_produto}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoque_minimo: min, ativo: true }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      onAdded();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: "#184036" }}>Adicionar Produto</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {!selected ? (
          <>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                placeholder="Buscar produto por nome ou SKU..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            {loading && <p className="text-xs text-gray-400 text-center py-2">Buscando...</p>}
            <ul className="divide-y max-h-56 overflow-y-auto">
              {results.map(p => (
                <li
                  key={p.id_produto}
                  className="py-2 px-1 cursor-pointer hover:bg-gray-50 rounded"
                  onClick={() => { setSelected(p); setQuery(""); setResults([]); }}
                >
                  <p className="text-sm font-medium" style={{ color: "#184036" }}>{p.nome}</p>
                  {p.sku && <p className="text-xs text-gray-400">{p.sku}</p>}
                </li>
              ))}
              {!loading && query.length >= 2 && results.length === 0 && (
                <li className="py-3 text-xs text-center text-gray-400">Nenhum produto encontrado</li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: "#FAFAF7", border: "1px solid #E8DCC8" }}>
              <p className="font-medium text-sm" style={{ color: "#184036" }}>{selected.nome}</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Estoque minimo</label>
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={min}
                onChange={e => setMin(Number(e.target.value))}
              />
              <p className="text-xs text-gray-400 mt-1">Alerta quando o saldo ficar abaixo deste valor.</p>
            </div>
            {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: "#F3EADA", color: "#184036" }}
                onClick={() => setSelected(null)}
              >
                Voltar
              </button>
              <button
                className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1"
                style={{ background: "#184036", color: "#F3EADA" }}
                onClick={handleAdd}
                disabled={saving}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Adicionar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── MovimentacaoModal ────────────────────────────────────────────────────────
function MovimentacaoModal({
  mov, locais, onClose, onDone,
}: { mov: MovModal; locais: LocalEstoque[]; onClose: () => void; onDone: () => void }) {
  const motivos = mov.tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SAIDA;
  const [qtd,        setQtd]        = useState(1);
  const [motivo,     setMotivo]     = useState(motivos[0].value);
  const [localId,    setLocalId]    = useState(2); // Default: Loja
  const [observacao, setObservacao] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState("");

  async function handleSubmit() {
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/movimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: mov.produtoId,
          tipo: mov.tipo,
          quantidade: qtd,
          motivo,
          local_estoque_id: localId,
          observacao: observacao || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  }

  const isEntrada = mov.tipo === "entrada";
  const accentColor = isEntrada ? "#059669" : "#DC2626";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isEntrada
              ? <ArrowUpCircle size={18} style={{ color: accentColor }} />
              : <ArrowDownCircle size={18} style={{ color: accentColor }} />}
            <h2 className="font-bold text-lg" style={{ color: "#184036" }}>
              {isEntrada ? "Entrada" : "Saida"}
            </h2>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <p className="text-sm font-medium mb-4" style={{ color: "#374151" }}>{mov.nomeProduto}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Local</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
              value={localId}
              onChange={e => setLocalId(Number(e.target.value))}
            >
              {locais.map(l => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Quantidade</label>
            <input
              type="number"
              min={1}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E8DCC8" }}
              value={qtd}
              onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Motivo</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
              style={{ borderColor: "#E8DCC8" }}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            >
              {motivos.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1 text-gray-500">Observacao (opcional)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: "#E8DCC8" }}
              placeholder="..."
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </div>
        </div>

        {err && <p className="text-xs text-red-500 mt-3">{err}</p>}

        <button
          className="w-full mt-5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
          style={{ background: accentColor, color: "#fff" }}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Confirmar {isEntrada ? "Entrada" : "Saida"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EstoqueComercialClient() {
  const router = useRouter();
  const [items,     setItems]     = useState<ItemEstoque[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [addOpen,   setAddOpen]   = useState(false);
  const [movModal,  setMovModal]  = useState<MovModal | null>(null);
  const [locais,    setLocais]    = useState<LocalEstoque[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/estoque-comercial");
      if (r.ok) setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLocais = useCallback(async () => {
    try {
      const r = await fetch("/api/locais-estoque");
      if (r.ok) setLocais(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); fetchLocais(); }, [fetchData, fetchLocais]);

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
            onClick={() => router.push("/estoque-comercial/transferencias")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium hover:bg-gray-100 transition-colors"
            style={{ color: "#184036" }}
            title="Transferencias"
          >
            <ArrowRightLeft size={15} />
            <span className="hidden sm:inline">Transferencias</span>
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
            onClick={fetchData}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
          >
            <Plus size={15} />
            Adicionar produto
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
            <button
              className="mt-3 text-sm underline"
              style={{ color: "#184036" }}
              onClick={() => setAddOpen(true)}
            >
              Adicionar o primeiro produto
            </button>
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
                <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Acoes</th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="Entrada"
                          className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
                          onClick={() => setMovModal({
                            produtoId: item.produto_id,
                            nomeProduto: item.nome_produto,
                            saldoAtual: item.disponivel,
                            tipo: "entrada",
                          })}
                        >
                          <ArrowUpCircle size={16} style={{ color: "#059669" }} />
                        </button>
                        <button
                          title="Saida"
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          onClick={() => setMovModal({
                            produtoId: item.produto_id,
                            nomeProduto: item.nome_produto,
                            saldoAtual: item.disponivel,
                            tipo: "saida",
                          })}
                          disabled={item.disponivel <= 0}
                        >
                          <ArrowDownCircle size={16} style={{ color: item.disponivel <= 0 ? "#D1D5DB" : "#DC2626" }} />
                        </button>
                        <button
                          title="Configurar"
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          onClick={() => router.push(`/estoque-comercial/${item.produto_id}`)}
                        >
                          <Settings2 size={16} className="text-gray-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {addOpen && (
        <AddProdutoModal
          onClose={() => setAddOpen(false)}
          onAdded={fetchData}
        />
      )}
      {movModal && (
        <MovimentacaoModal
          mov={movModal}
          locais={locais}
          onClose={() => setMovModal(null)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
