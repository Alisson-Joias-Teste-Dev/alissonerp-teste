"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, ClipboardList, Plus, Loader2, X,
  RefreshCw, CheckCircle, XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Inventario {
  id: number;
  local_estoque_id: number;
  local_nome: string;
  status: string;
  obs: string | null;
  categoria: string | null;
  data_abertura: string;
  data_conclusao: string | null;
  total_itens: number;
  itens_contados: number;
  itens_divergentes: number;
  criado_por_email: string | null;
  concluido_por_email: string | null;
}

interface LocalEstoque { id: number; nome: string; }
interface Categoria { categoria: string; total_produtos: number; total_estoque?: number; }


function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  aberto:      { bg: "#DBEAFE", text: "#1E40AF", label: "Aberto"      },
  em_contagem: { bg: "#FEF3C7", text: "#92400E", label: "Em contagem" },
  concluido:   { bg: "#D1FAE5", text: "#065F46", label: "Concluido"   },
  cancelado:   { bg: "#FEE2E2", text: "#991B1B", label: "Cancelado"   },
};

export default function InventarioPage() {
  const router = useRouter();
  const [items,       setItems]      = useState<Inventario[]>([]);
  const [locais,      setLocais]     = useState<LocalEstoque[]>([]);
  const [categorias,  setCategorias] = useState<Categoria[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [novoOpen,    setNovoOpen]   = useState(false);
  const [novoLocal,   setNovoLocal]  = useState(2);
  const [novoCategoria, setNovoCategoria] = useState("");
  const [novoObs,     setNovoObs]    = useState("");
  const [criando,     setCriando]    = useState(false);
  const [err,          setErr]       = useState("");


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/estoque-comercial/inventario");
      if (r.ok) setItems(await r.json());
    } finally { setLoading(false); }
  }, []);

  const fetchLocais = useCallback(async () => {
    try {
      const r = await fetch("/api/locais-estoque");
      if (r.ok) setLocais(await r.json());
    } catch { /* ignore */ }
  }, []);

  const fetchCategorias = useCallback(async (localId: number) => {
    try {
      const r = await fetch(`/api/estoque-comercial/categorias?local_estoque_id=${localId}`);
      if (r.ok) setCategorias(await r.json());
    } catch { /* ignore */ }
  }, []);

  // Carregar categorias ao abrir modal ou mudar local
  useEffect(() => {
    if (novoOpen) fetchCategorias(novoLocal);
  }, [novoOpen, novoLocal, fetchCategorias]);

  useEffect(() => { fetchData(); fetchLocais(); }, [fetchData, fetchLocais]);

  async function handleCriar() {
    setCriando(true); setErr("");
    try {
      const r = await fetch("/api/estoque-comercial/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          local_estoque_id: novoLocal,
          obs: novoObs || undefined,
          categoria: novoCategoria || undefined,
        }),
      });

      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Erro");
      const data = await r.json() as { id: number };
      setNovoOpen(false);
      await fetchData();
      router.push(`/estoque-comercial/inventario/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro");
    } finally { setCriando(false); }
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
            Inventario Fisico
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Contagem e reconciliacao de estoque</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="p-2 rounded-xl hover:bg-gray-100" title="Atualizar">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          <button
            onClick={() => setNovoOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "#184036", color: "#F3EADA" }}
          >
            <Plus size={15} />
            Novo inventario
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin" style={{ color: "#184036" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Nenhum inventario realizado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(inv => {
            const st = STATUS_STYLE[inv.status] ?? STATUS_STYLE.aberto;
            const progresso = inv.total_itens > 0
              ? Math.round((Number(inv.itens_contados) / Number(inv.total_itens)) * 100)
              : 0;
            return (
              <div
                key={inv.id}
                className="rounded-xl px-4 py-4 cursor-pointer hover:shadow-sm transition-shadow"
                style={{ border: "1px solid #E8DCC8", background: "#FAFAF7" }}
                onClick={() => router.push(`/estoque-comercial/inventario/${inv.id}`)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <ClipboardList size={18} style={{ color: "#184036" }} />
                    <div>
                      <span className="font-medium text-sm" style={{ color: "#184036" }}>
                        Inventario #{inv.id}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">{inv.local_nome}</span>
                      {inv.categoria && (
                        <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded" style={{ background: "#F3EADA", color: "#7A5A4A" }}>
                          {inv.categoria}
                        </span>
                      )}

                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: st.bg, color: st.text }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>Itens: {inv.itens_contados}/{inv.total_itens}</span>
                  {Number(inv.itens_divergentes) > 0 && (
                    <span style={{ color: "#DC2626" }}>
                      {inv.itens_divergentes} divergencia(s)
                    </span>
                  )}
                  <span>{fmtDate(inv.data_abertura)}</span>
                  {inv.status !== "concluido" && inv.status !== "cancelado" && (
                    <span style={{ color: "#2563EB" }}>{progresso}% contado</span>
                  )}
                </div>
                {inv.status !== "concluido" && inv.status !== "cancelado" && inv.total_itens > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progresso}%`, background: "#184036" }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal novo inventário */}
      {novoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg" style={{ color: "#184036" }}>Novo Inventario</h2>
              <button onClick={() => setNovoOpen(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Local de estoque</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={novoLocal}
                onChange={e => { setNovoLocal(Number(e.target.value)); setNovoCategoria(""); }}
              >
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1 text-gray-500">
                Categoria <span className="text-gray-400 font-normal">(opcional — filtra os itens)</span>
              </label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none bg-white"
                style={{ borderColor: "#E8DCC8" }}
                value={novoCategoria}
                onChange={e => setNovoCategoria(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categorias.map(c => (
                  <option key={c.categoria} value={c.categoria}>
                    {c.categoria} ({c.total_produtos} prod.)
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1 text-gray-500">Observacao (opcional)</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "#E8DCC8" }}
                value={novoObs}
                onChange={e => setNovoObs(e.target.value)}
              />
            </div>
            {err && <p className="text-xs text-red-500 mb-3">{err}</p>}

            <button
              className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "#184036", color: "#F3EADA" }}
              onClick={handleCriar}
              disabled={criando}
            >
              {criando ? <Loader2 size={14} className="animate-spin" /> : <ClipboardList size={14} />}
              Abrir Inventario
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
