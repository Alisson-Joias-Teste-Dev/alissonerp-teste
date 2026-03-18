"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, FlaskConical } from "lucide-react";

const C = {
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
  amber:       "#D97706",
};

interface Deposito { id: number; nome: string; }

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function OrdemTesteModal({ isOpen, onClose, onSuccess }: Props) {
  const [pesoNegociado, setPesoNegociado] = useState("2.50");
  const [etapaInicial, setEtapaInicial]   = useState<"novas_ordens" | "aguardando" | "em_andamento">("novas_ordens");
  const [depositoId, setDepositoId]       = useState<number | "">("");
  const [depositos, setDepositos]         = useState<Deposito[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");
  const [success, setSuccess]             = useState<{ numero: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pcp/depositos")
      .then((r) => r.json())
      .then((data: Deposito[]) => setDepositos(data.filter((d) => d.id !== 1)))
      .catch(() => {});
  }, [isOpen]);

  function resetForm() {
    setPesoNegociado("2.50");
    setEtapaInicial("novas_ordens");
    setDepositoId("");
    setError("");
    setSuccess(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/pcp/ordem-teste", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          peso_negociado: parseFloat(pesoNegociado) || 2.5,
          deposito_id:    etapaInicial === "em_andamento" ? (depositoId || null) : null,
          etapa_inicial:  etapaInicial,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; ordem?: { numero: string } };
      if (!res.ok) {
        setError(json.error ?? "Erro ao criar ordem de teste");
        return;
      }
      setSuccess({ numero: json.ordem!.numero });
      setTimeout(() => {
        resetForm();
        onSuccess();
        onClose();
      }, 2000);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const podeCriar = !loading && !success &&
    !(etapaInicial === "em_andamento" && !depositoId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div className="flex items-center gap-2.5">
            <FlaskConical size={18} style={{ color: C.amber }} />
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#111827" }}>
                Nova Ordem de Teste
              </h3>
              <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Modo Desenvolvimento</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={16} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Peso negociado */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Peso Negociado (g)
            </label>
            <input
              type="number"
              value={pesoNegociado}
              onChange={(e) => setPesoNegociado(e.target.value)}
              step="0.01"
              min="0.01"
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          {/* Etapa inicial */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: "#6B7280" }}
            >
              Etapa Inicial
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="etapa"
                  value="novas_ordens"
                  checked={etapaInicial === "novas_ordens"}
                  onChange={() => { setEtapaInicial("novas_ordens"); setDepositoId(""); }}
                  className="accent-amber-500"
                />
                <span className="text-sm" style={{ color: "#374151" }}>
                  Novas Ordens{" "}
                  <span className="text-[11px]" style={{ color: "#9CA3AF" }}>(crua, sem apontamento)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="etapa"
                  value="aguardando"
                  checked={etapaInicial === "aguardando"}
                  onChange={() => { setEtapaInicial("aguardando"); setDepositoId(""); }}
                  className="accent-blue-500"
                />
                <span className="text-sm" style={{ color: "#374151" }}>
                  Aguardando{" "}
                  <span className="text-[11px]" style={{ color: "#9CA3AF" }}>(no pote)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="etapa"
                  value="em_andamento"
                  checked={etapaInicial === "em_andamento"}
                  onChange={() => setEtapaInicial("em_andamento")}
                  className="accent-green-600"
                />
                <span className="text-sm" style={{ color: "#374151" }}>
                  Em Andamento{" "}
                  <span className="text-[11px]" style={{ color: "#9CA3AF" }}>(selecionar operador)</span>
                </span>
              </label>
            </div>
          </div>

          {/* Operador (só em_andamento) */}
          {etapaInicial === "em_andamento" && (
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#6B7280" }}
              >
                Operador
              </label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value ? parseInt(e.target.value) : "")}
                className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
              >
                <option value="">Selecione...</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FFFBEB", color: "#92400E" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              🧪 Ordem {success.numero} criada! Atualizando Kanban...
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!podeCriar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.amber, color: "#fff" }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" />Criando...</>
              : <>🧪 Criar Ordem Teste</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
