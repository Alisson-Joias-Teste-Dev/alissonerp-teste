"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ArrowRightLeft, Plus, Loader2, X,
  CheckCircle, XCircle, Search, RefreshCw, Clock,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Transferencia {
  id: number;
  produto_id: number;
  quantidade: number;
  status: string;
  obs: string | null;
  local_origem_id: number;
  local_origem_nome: string;
  local_destino_id: number;
  local_destino_nome: string;
  nome_produto: string;
  sku: string | null;
  created_at: string;
  recebido_em: string | null;
  cancelado_em: string | null;
  enviado_por_email: string | null;
  recebido_por_email: string | null;
}

interface LocalEstoque { id: number; nome: string; }

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pendente:  { bg: "#FEF3C7", text: "#92400E", label: "Pendente"  },
  concluido: { bg: "#D1FAE5", text: "#065F46", label: "Concluido" },
  cancelado: { bg: "#FEE2E2", text: "#991B1B", label: "Cancelado" },
};

// ─── NovaTransferenciaModal ──────────────────────────────────────────────────
function NovaTransferenciaModal({
  locais, onClose, onDone,
}: { locais: LocalEstoque[]; onClose: () => void; onDone: () => void }) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<{ id_produto: number; nome: string; sku: string }[]>([]);
  const [searching,setSearching]= useState(false);
  const [selected, setSelected] = useState<{ id_produto: number; nome: string } | null>(null);
  const [qtd,      setQtd]      = useState(1);
  const [origem,   setOrigem]   = useState(locais[0]?.id ?? 1);
  const [destino,  setDestino]  = useState(locais[1]?.id ?? 2);
  const [obs,      setObs]      = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(query)}&limit=8`);
        if (r.ok) setResults(await r.json());
      } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleSubmit() {
    if (!selected) return;
    if (origem === destino) { setErr("Origem e destino devem ser diferentes"); return; }
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: selected.id_produto,
          quantidade: qtd,
          local_origem_id: origem,
          local_destino_id: destino,
          obs: obs || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      onDone(); onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg" style={{ color: "#184036" }}>Nova Transferencia</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        {!selected ? (
          <>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                placeholder="Buscar produto..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            {searching && <p className="text-xs text-gray-400 text-center py-2">Buscando...</p>}
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
            </ul>
          </>
        ) : (
          <>
            <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: "#FAFAF7", border: "1px solid #E8DCC8" }}>
              <p className="font-medium text-sm" style={{ color: "#184036" }}>{selected.nome}</p>
              <button className="text-xs text-gray-400 underline mt-1" onClick={() => setSelected(null)}>Trocar</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Origem</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}
                  value={origem}
                  onChange={e => setOrigem(Number(e.target.value))}
                >
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1 text-gray-500">Destino</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                  style={{ borderColor: "#E8DCC8" }}
                  value={destino}
                  onChange={e => setDestino(Number(e.target.value))}
                >
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Quantidade</label>
              <input
                type="number" min={1}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={qtd} onChange={e => setQtd(Math.max(1, Number(e.target.value)))}
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Observacao (opcional)</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={obs} onChange={e => setObs(e.target.value)}
              />
            </div>
            {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
            <button
              className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "#184036", color: "#F3EADA" }}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
              Transferir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TransferenciasPage() {
  const router = useRouter();
  const [items,   setItems]   = useState<Transferencia[]>([]);
  const [locais,  setLocais]  = useState<LocalEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [novaOpen,setNovaOpen]= useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/estoque-comercial/transferir");
      if (r.ok) setItems(await r.json());
    } finally { setLoading(false); }
  }, []);

  const fetchLocais = useCallback(async () => {
    try {
      const r = await fetch("/api/locais-estoque");
      if (r.ok) setLocais(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchData(); fetchLocais(); }, [fetchData, fetchLocais]);

  async function handleAction(id: number, action: "concluir" | "cancelar") {
    const msg = action === "concluir"
      ? "Confirmar recebimento desta transferencia?"
      : "Cancelar esta transferencia? O estoque sera devolvido ao local de origem.";
    if (!confirm(msg)) return;

    setActionLoading(id);
    try {
      const r = await fetch(`/api/estoque-comercial/transferir/${id}/${action}`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json() as { error?: string };
        alert(err.error ?? "Erro");
      } else {
        await fetchData();
      }
    } finally { setActionLoading(null); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button
        className="flex items-center gap-1.5 text-sm mb-6 hover:opacity-70"
        style={{ color: "#184036" }}
        onClick={() => router.push("/estoque-comercial")}
      >
        <ArrowLeft size={15} />
        Estoque Comercial
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif", color: "#184036" }}>
            Transferencias
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Movimentacao entre locais de estoque</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-xl hover:bg-gray-100" title="Atualizar">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setNovaOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
          >
            <Plus size={15} />
            Nova transferencia
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <ArrowRightLeft size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Nenhuma transferencia registrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(t => {
            const st = STATUS_STYLE[t.status] ?? STATUS_STYLE.pendente;
            return (
              <div
                key={t.id}
                className="rounded-xl px-4 py-3 flex items-center gap-4"
                style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}
              >
                <ArrowRightLeft size={18} style={{ color: "#D97706" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm" style={{ color: "#184036" }}>
                      {t.nome_produto}
                    </span>
                    {t.sku && <span className="text-xs text-gray-400">{t.sku}</span>}
                    <span className="text-sm font-bold" style={{ color: "#D97706" }}>
                      x{t.quantidade}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t.local_origem_nome} &rarr; {t.local_destino_nome}
                  </p>
                  {t.obs && <p className="text-xs text-gray-400 mt-0.5">{t.obs}</p>}
                  <p className="text-xs text-gray-300 mt-0.5">
                    {fmtDate(t.created_at)}
                    {t.enviado_por_email && ` - ${t.enviado_por_email}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: st.bg, color: st.text }}
                  >
                    {st.label}
                  </span>
                  {t.status === "pendente" && (
                    <>
                      <button
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:bg-green-50"
                        style={{ color: "#059669" }}
                        onClick={() => handleAction(t.id, "concluir")}
                        disabled={actionLoading === t.id}
                        title="Confirmar recebimento"
                      >
                        {actionLoading === t.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <CheckCircle size={14} />}
                        Receber
                      </button>
                      <button
                        className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:bg-red-50"
                        style={{ color: "#DC2626" }}
                        onClick={() => handleAction(t.id, "cancelar")}
                        disabled={actionLoading === t.id}
                        title="Cancelar"
                      >
                        <XCircle size={14} />
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {novaOpen && (
        <NovaTransferenciaModal
          locais={locais}
          onClose={() => setNovaOpen(false)}
          onDone={fetchData}
        />
      )}
    </div>
  );
}
