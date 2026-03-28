"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle } from "lucide-react";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface LocalItem {
  id: number;
  nome: string;
}

interface Insumo {
  id: number;
  nome: string;
  sku: string | null;
  categoria_id: number;
  unidade: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  locais: LocalItem[];
}

export default function TransferirLocalModal({ isOpen, onClose, onSuccess, locais }: Props) {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [insumoId, setInsumoId] = useState<number | "">("");
  const [quantidade, setQuantidade] = useState("");
  const [localOrigemId, setLocalOrigemId] = useState<number | "">("");
  const [localDestinoId, setLocalDestinoId] = useState<number | "">("");
  const [obs, setObs] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pcp/insumos")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setInsumos(data); })
      .catch(() => {});
  }, [isOpen]);

  function resetForm() {
    setInsumoId("");
    setQuantidade("");
    setLocalOrigemId("");
    setLocalDestinoId("");
    setObs("");
    setError("");
    setSuccess(false);
  }

  function handleClose() { resetForm(); onClose(); }

  const insumoSelecionado = insumos.find((i) => i.id === insumoId);
  const isPedra = insumoSelecionado?.categoria_id === 2;
  const quantidadeLabel = isPedra ? "Quilates (ct)" : "Peso (g)";
  const quantidadeStep = isPedra ? "0.0001" : "0.001";

  async function handleSubmit() {
    setError("");
    if (!insumoId) { setError("Selecione o insumo."); return; }
    const qtdNum = parseFloat(quantidade);
    if (isNaN(qtdNum) || qtdNum <= 0) { setError("Quantidade deve ser maior que zero."); return; }
    if (!localOrigemId) { setError("Selecione o local de origem."); return; }
    if (!localDestinoId) { setError("Selecione o local de destino."); return; }
    if (localOrigemId === localDestinoId) { setError("Origem e destino devem ser diferentes."); return; }

    setLoading(true);

    const res = await fetch("/api/estoque/transferir-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insumo_id: insumoId,
        quantidade: qtdNum,
        local_origem_id: localOrigemId,
        local_destino_id: localDestinoId,
        obs: obs.trim() || undefined,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao transferir.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      resetForm();
      onSuccess?.();
      onClose();
    }, 1500);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Transferir entre Locais
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Move saldo de um local para outro
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Insumo */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Insumo <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <select
              value={insumoId}
              onChange={(e) => { setInsumoId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            >
              <option value="">Selecione o insumo...</option>
              {insumos.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}{i.sku ? ` (${i.sku})` : ""}{i.categoria_id === 2 ? " — Pedra" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Quantidade */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              {quantidadeLabel} <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              type="number"
              step={quantidadeStep}
              min={quantidadeStep}
              value={quantidade}
              onChange={(e) => { setQuantidade(e.target.value); setError(""); }}
              placeholder="0.000"
              className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            />
          </div>

          {/* Origem → Destino */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B7280" }}
              >
                Origem <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <select
                value={localOrigemId}
                onChange={(e) => { setLocalOrigemId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
              >
                <option value="">Selecione...</option>
                {locais.map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B7280" }}
              >
                Destino <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <select
                value={localDestinoId}
                onChange={(e) => { setLocalDestinoId(e.target.value ? parseInt(e.target.value) : ""); setError(""); }}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
              >
                <option value="">Selecione...</option>
                {locais.filter((l) => l.id !== localOrigemId).map((l) => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Info direcional */}
          {localOrigemId && localDestinoId && (
            <div
              className="rounded-lg px-3 py-2.5 text-[12px]"
              style={{ backgroundColor: C.cremeBg, color: "#6B7280" }}
            >
              {locais.find((l) => l.id === localOrigemId)?.nome ?? `Local ${localOrigemId}`}
              {" → "}
              {locais.find((l) => l.id === localDestinoId)?.nome ?? `Local ${localDestinoId}`}
            </div>
          )}

          {/* Observação */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Observação <span className="font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Transferência para exposição"
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              Transferência registrada com sucesso!
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || success}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Transferindo...
              </>
            ) : (
              "Transferir"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
