"use client";

import { useState } from "react";
import { X, Loader2, CheckCircle, AlertCircle, CheckCircle2 } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface OrdemDetalhe {
  doo_id: number;
  ordem_id: number;
  numero_ordem: string | null;
  peso_bruto: number | null;
  peso_pedras: number | null;
  peso_ouro_real: number | null;
  pedras_fechamento: number | null;
  data_baixa: string | null;
}

interface ConcluirDistModalProps {
  isOpen: boolean;
  onClose: () => void;
  distribuicaoId: number;
  depositoLabel: string;
  ouroEntregue: number;   // (total_metal + aditivo) − retorno do lote
  ordens: OrdemDetalhe[];
  onSuccess?: () => void;
}

export default function ConcluirDistModal({
  isOpen, onClose, distribuicaoId, depositoLabel, ouroEntregue, ordens, onSuccess,
}: ConcluirDistModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const semSaida      = ordens.filter((o) => !o.data_baixa);
  const podeConfirmar = semSaida.length === 0 && ordens.length > 0;

  // Balanço do lote — calculado a partir das saídas registradas
  const ouroNasPecas  = ordens.reduce((s, o) => s + Number(o.peso_ouro_real ?? 0), 0);
  const totalBruto    = ordens.reduce((s, o) => s + Number(o.peso_bruto ?? 0), 0);
  const totalPedras   = ordens.reduce((s, o) => s + Number(o.pedras_fechamento ?? 0), 0);
  const resultadoLote = ouroEntregue - ouroNasPecas; // + = quebra, - = saldo

  async function handleConfirmar() {
    if (!podeConfirmar) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/distribuicao/${distribuicaoId}/concluir`, { method: "POST" });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setError(json.error ?? "Erro ao concluir"); return; }
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch {
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  function fmt(v: number | null, decimals = 2) {
    return Number(v ?? 0).toFixed(decimals);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Concluir Distribuição</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Dist #{distribuicaoId} · {depositoLabel}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Status de saídas */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-lg"
            style={{
              backgroundColor: podeConfirmar ? "#ECFDF5" : "#FEF3C7",
              border: `1px solid ${podeConfirmar ? "#6EE7B7" : "#FDE68A"}`,
            }}
          >
            {podeConfirmar
              ? <CheckCircle2 size={16} style={{ color: "#059669" }} />
              : <AlertCircle size={16} style={{ color: "#B45309" }} />}
            <span className="text-[13px] font-medium" style={{ color: podeConfirmar ? "#065F46" : "#92400E" }}>
              {podeConfirmar
                ? `${ordens.length} de ${ordens.length} ordens com saída registrada`
                : `${semSaida.length} ordem(ns) ainda sem saída — registre antes de concluir`}
            </span>
          </div>

          {/* Lista de ordens */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Resumo por Ordem
            </p>
            <div className="rounded-lg border divide-y overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              {ordens.map((o) => {
                const temSaida = !!o.data_baixa;
                return (
                  <div
                    key={o.doo_id}
                    className="flex items-start gap-3 px-4 py-3"
                    style={{ backgroundColor: temSaida ? "white" : "#FFFBEB" }}
                  >
                    {temSaida
                      ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: "#059669" }} />
                      : <AlertCircle size={14} className="mt-0.5 shrink-0" style={{ color: "#B45309" }} />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>
                        {o.numero_ordem ?? `#${o.ordem_id}`}
                      </p>
                      {temSaida ? (
                        <p className="text-[11px] font-mono mt-0.5" style={{ color: "#6B7280" }}>
                          bruto {fmt(o.peso_bruto)}g
                          {Number(o.peso_pedras) > 0 && ` · pedras ${fmt(o.peso_pedras)}g`}
                          {` · ouro `}
                          <span style={{ color: "#059669" }}>{fmt(o.peso_ouro_real)}g</span>
                        </p>
                      ) : (
                        <p className="text-[11px] mt-0.5" style={{ color: "#B45309" }}>Sem saída registrada</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Balanço do lote */}
          {podeConfirmar && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="px-4 py-2 border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                  Balanço do Lote
                </span>
              </div>
              <div className="px-4 py-3 space-y-2 text-[13px] font-mono">
                <div className="flex justify-between">
                  <span style={{ color: "#6B7280" }}>Ouro entregue ao lote</span>
                  <span style={{ color: "#374151" }}>{fmt(ouroEntregue, 3)}g</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: "#6B7280" }}>Ouro nas peças</span>
                  <span style={{ color: "#374151" }}>− {fmt(ouroNasPecas, 3)}g</span>
                </div>
                <div
                  className="flex justify-between pt-2 mt-1 border-t font-bold text-sm"
                  style={{ borderColor: C.cremeBorder }}
                >
                  <span style={{ color: "#374151" }}>Resultado</span>
                  {resultadoLote > 0.001 ? (
                    <span style={{ color: "#DC2626" }}>
                      +{fmt(resultadoLote, 3)}g 🔴 QUEBRA
                    </span>
                  ) : resultadoLote < -0.001 ? (
                    <span style={{ color: "#059669" }}>
                      {fmt(resultadoLote, 3)}g 💚 SALDO
                    </span>
                  ) : (
                    <span style={{ color: "#6B7280" }}>
                      0.000g ✅ ZERADO
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Totais */}
          {podeConfirmar && (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="px-4 py-2 border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                  Totais do Lote
                </span>
              </div>
              <div className="grid grid-cols-3 divide-x" style={{ borderColor: C.cremeBorder }}>
                {[
                  { label: "Bruto",  value: `${fmt(totalBruto)}g`,   color: "#374151" },
                  { label: "Ouro",   value: `${fmt(ouroNasPecas)}g`, color: C.esmeralda },
                  { label: "Pedras", value: totalPedras > 0 ? `${Math.round(totalPedras)} UN` : "—", color: "#7C3AED" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="px-4 py-3 text-center" style={{ borderColor: C.cremeBorder }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{label}</p>
                    <p className="font-mono font-bold text-sm mt-1" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aviso */}
          {podeConfirmar && (
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
              ⚠️ Ao confirmar, a distribuição será fechada. O resultado do lote ficará registrado.
            </p>
          )}

          {error   && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}><AlertCircle size={14} className="shrink-0" />{error}</div>}
          {success && <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}><CheckCircle size={14} className="shrink-0" />Distribuição concluída!</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: C.cremeBorder }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={loading || success || !podeConfirmar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" />Concluindo...</>
              : <><CheckCircle2 size={14} />Concluir Lote</>}
          </button>
        </div>
      </div>
    </div>
  );
}
