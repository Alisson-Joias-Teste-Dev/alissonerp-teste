"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface Deposito { id: number; nome: string; }
interface Setor    { id: number; nome: string; }
interface Ordem {
  id: number;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number;
  cliente_nome: string | null;
}

interface NovaDistribuicaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NovaDistribuicaoModal({
  isOpen, onClose, onSuccess,
}: NovaDistribuicaoModalProps) {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [setores, setSetores]     = useState<Setor[]>([]);
  const [ordens, setOrdens]       = useState<Ordem[]>([]);

  const [depositoId, setDepositoId]       = useState<number | "">("");
  const [setorId, setSetorId]             = useState<number | "">("");
  const [selectedOrdens, setSelectedOrdens] = useState<Set<number>>(new Set());
  const [busca, setBusca]                 = useState("");

  const [loading, setLoading]   = useState(false);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState(false);

  const supabase = createClient();

  // Carregar depósitos (excluindo almoxarifado ID=1)
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((rows) => setDepositos((rows as Deposito[]).filter((d) => d.id !== 1)));
  }, [isOpen]);

  // Carregar ordens disponíveis
  useEffect(() => {
    if (!isOpen) return;
    setLoadingOrdens(true);
    fetch("/api/distribuicao/ordens-disponiveis")
      .then((r) => r.json())
      .then((rows) => setOrdens(rows as Ordem[]))
      .catch(() => setOrdens([]))
      .finally(() => setLoadingOrdens(false));
  }, [isOpen]);

  // Filtrar setores pelo depósito selecionado
  useEffect(() => {
    setSetorId("");
    setSetores([]);
    if (!depositoId) return;
    fetch(`/api/pcp/setores?deposito_id=${depositoId}`)
      .then((r) => r.json())
      .then((rows) => setSetores(rows as Setor[]));
  }, [depositoId]);

  // Ordens filtradas pela busca
  const ordensFiltradas = useMemo(() => {
    if (!busca.trim()) return ordens;
    const q = busca.toLowerCase();
    return ordens.filter((o) =>
      (o.numero_ordem ?? "").toLowerCase().includes(q) ||
      (o.cliente_nome ?? "").toLowerCase().includes(q),
    );
  }, [ordens, busca]);

  function toggleOrdem(id: number) {
    setSelectedOrdens((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setError("");
  }

  function reset() {
    setDepositoId(""); setSetorId(""); setSelectedOrdens(new Set());
    setBusca(""); setError(""); setSuccess(false);
  }

  function handleClose() { reset(); onClose(); }

  async function handleSubmit() {
    setError("");
    if (!depositoId) { setError("Selecione o depósito/operador."); return; }
    if (selectedOrdens.size === 0) { setError("Selecione ao menos uma ordem."); return; }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    const res = await fetch("/api/distribuicao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deposito_id: depositoId,
        setor_id: setorId || null,
        ordem_ids: Array.from(selectedOrdens),
        user_id: user?.id ?? null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao criar distribuição.");
      return;
    }

    setSuccess(true);
    setTimeout(() => { reset(); onSuccess(); }, 1200);
  }

  if (!isOpen) return null;

  const canSubmit = !!depositoId && selectedOrdens.size > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Nova Distribuição</h3>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* Depósito / Operador */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Depósito / Operador <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <select
              value={depositoId}
              onChange={(e) => { setDepositoId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            >
              <option value="">Selecione…</option>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </div>

          {/* Setor (filtrado pelo depósito) */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
              Setor <span style={{ color: "#D1D5DB" }}>(opcional)</span>
            </label>
            <select
              value={setorId}
              onChange={(e) => setSetorId(e.target.value ? parseInt(e.target.value) : "")}
              disabled={!depositoId || setores.length === 0}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none disabled:opacity-50"
              style={{ borderColor: C.cremeBorder }}
            >
              <option value="">— Sem setor específico</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>

          {/* Ordens */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
                Ordens <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                {ordens.length} disponíveis · {selectedOrdens.size} selecionadas
              </span>
            </div>

            {/* Busca */}
            <div className="relative mb-2">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por ordem ou cliente…"
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            <div
              className="rounded-lg border divide-y overflow-y-auto"
              style={{ borderColor: C.cremeBorder, maxHeight: 220 }}
            >
              {loadingOrdens && (
                <p className="text-center text-sm py-6" style={{ color: "#9CA3AF" }}>
                  <Loader2 size={14} className="inline animate-spin mr-1" />Carregando…
                </p>
              )}
              {!loadingOrdens && ordensFiltradas.length === 0 && (
                <p className="text-center text-sm py-6" style={{ color: "#9CA3AF" }}>
                  {busca ? "Nenhuma ordem encontrada" : "Nenhuma ordem disponível"}
                </p>
              )}
              {ordensFiltradas.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedOrdens.has(o.id)}
                    onChange={() => toggleOrdem(o.id)}
                    className="rounded shrink-0"
                    style={{ accentColor: C.esmeralda }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                      {o.numero_ordem ?? `#${o.id}`}
                    </p>
                    {o.cliente_nome && (
                      <p className="text-[11px] truncate" style={{ color: "#6B7280" }}>{o.cliente_nome}</p>
                    )}
                  </div>
                  {o.peso_metal_negociado > 0 && (
                    <span className="text-[11px] font-mono shrink-0" style={{ color: "#9CA3AF" }}>
                      {o.peso_metal_negociado.toFixed(2)}g
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Distribuição criada com sucesso!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || !canSubmit}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" />Criando…</>
              : `Criar Distribuição${selectedOrdens.size > 0 ? ` (${selectedOrdens.size})` : ""}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
