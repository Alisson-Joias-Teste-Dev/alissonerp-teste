"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
}

interface PedraApontada {
  insumo_id: number;
  insumo_nome: string;
  sku: string | null;
  peso_pedra: number;
  qtd_disponivel: number;
}

export interface OrdemInfo {
  id: number;
  numero_ordem: string | null;
  cliente_nome: string | null;
  peso_metal_negociado: number;
}

interface FecharOrdemDistModalProps {
  isOpen: boolean;
  onClose: () => void;
  distribuicaoId: number;
  depositoNome: string;
  ordem: OrdemInfo | null;
  onSuccess?: () => void;
}

export default function FecharOrdemDistModal({
  isOpen, onClose, distribuicaoId, depositoNome, ordem, onSuccess,
}: FecharOrdemDistModalProps) {
  const [peso, setPeso] = useState("");
  const [pedrasApontadas, setPedrasApontadas] = useState<PedraApontada[]>([]);
  const [pedrasQtd, setPedrasQtd] = useState<Record<number, string>>({});
  const [loadingPedras, setLoadingPedras] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setPeso(""); setPedrasQtd({}); setError(""); setSuccess(false);
    setFotoFile(null); setFotoPreview(null); setValidacaoIA(null); setValidando(false);
  }

  useEffect(() => {
    if (!isOpen || !ordem) return;
    resetForm();
    setLoadingPedras(true);
    fetch(`/api/distribuicao/${distribuicaoId}/pedras-apontadas`)
      .then((r) => r.json())
      .then((data: PedraApontada[]) => {
        const lista = Array.isArray(data) ? data : [];
        setPedrasApontadas(lista);
        const init: Record<number, string> = {};
        lista.forEach((p) => { init[p.insumo_id] = "0"; });
        setPedrasQtd(init);
      })
      .catch(() => setPedrasApontadas([]))
      .finally(() => setLoadingPedras(false));
  }, [isOpen, ordem?.id]); // eslint-disable-line

  // Reset IA ao mudar peso bruto
  useEffect(() => { if (validacaoIA) setValidacaoIA(null); }, [peso]); // eslint-disable-line

  // ─── Cálculos em tempo real ───────────────────────────────────────────────
  const pesoBrutoNum = parseFloat(peso) || 0;

  const pesoPedrasTotal = pedrasApontadas.reduce((sum, p) => {
    const qtd = parseInt(pedrasQtd[p.insumo_id] || "0") || 0;
    return sum + qtd * (p.peso_pedra ?? 0);
  }, 0);

  const totalPedrasUn = Object.values(pedrasQtd).reduce(
    (s, v) => s + (parseInt(v) || 0), 0,
  );

  const ouroReal = pesoBrutoNum - pesoPedrasTotal;

  // ─── IA ───────────────────────────────────────────────────────────────────
  const validarComIA = useCallback(async (file: File, valor: number) => {
    setValidando(true); setValidacaoIA(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("peso", String(valor));
    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
    setValidacaoIA(await res.json());
    setValidando(false);
  }, []);

  const handleFoto = useCallback(async (file: File) => {
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    setValidacaoIA(null);
    const num = parseFloat(peso);
    if (!isNaN(num) && num > 0) await validarComIA(file, num);
  }, [peso, validarComIA]);

  // ─── Submit ───────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");
    if (!ordem) return;
    if (pesoBrutoNum <= 0) { setError("Peso bruto deve ser maior que zero."); return; }
    if (ouroReal < 0) {
      setError("Peso das pedras maior que o peso bruto. Verifique as quantidades.");
      return;
    }
    if (!fotoFile) { setError("Foto da balança obrigatória."); return; }
    if (!validacaoIA?.match) {
      setError("O peso precisa ser confirmado pela IA antes de salvar.");
      return;
    }
    for (const p of pedrasApontadas) {
      const qtd = parseInt(pedrasQtd[p.insumo_id] || "0") || 0;
      if (qtd > p.qtd_disponivel) {
        setError(`"${p.insumo_nome}" excede o disponível (${p.qtd_disponivel} UN).`);
        return;
      }
    }

    setLoading(true);

    const supabase = createClient();
    const ext = fotoFile.name.split(".").pop() ?? "jpg";
    const path = `fechamentos/dist${distribuicaoId}-ord${ordem.id}-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("apontamento-fotos")
      .upload(path, fotoFile, { contentType: fotoFile.type });
    if (uploadErr) {
      setError("Erro ao enviar foto: " + uploadErr.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const pedrasUtilizadas = pedrasApontadas
      .map((p) => ({ insumo_id: p.insumo_id, qtd_utilizada: parseInt(pedrasQtd[p.insumo_id] || "0") || 0 }))
      .filter((p) => p.qtd_utilizada > 0);

    const res = await fetch(`/api/distribuicao/${distribuicaoId}/saida`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ordem_id: ordem.id,
        peso_bruto: pesoBrutoNum,
        pedras_utilizadas: pedrasUtilizadas,
        foto_balanca: path,
        user_id: user?.id ?? null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao registrar saída.");
      return;
    }

    setSuccess(true);
    setTimeout(() => { resetForm(); onSuccess?.(); onClose(); }, 1500);
  }

  if (!isOpen || !ordem) return null;

  const fotoOk = validacaoIA?.match === true;
  const podeSalvar = !loading && !success && pesoBrutoNum > 0 && fotoOk;
  const iaColor = validacaoIA?.match ? "#059669" : "#DC2626";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Saída — {ordem.numero_ordem ?? `#${ordem.id}`}
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {ordem.cliente_nome ?? "—"} · {depositoNome}
              {ordem.peso_metal_negociado > 0 && ` · neg. ${ordem.peso_metal_negociado.toFixed(2)}g`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Peso bruto */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Peso Bruto da Peça (g) *
              <span className="ml-2 font-normal normal-case">ouro + pedras juntos</span>
            </label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              value={peso}
              onChange={(e) => { setPeso(e.target.value); setError(""); }}
              placeholder="0.000"
              className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          {/* Foto */}
          <div>
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: "#6B7280" }}
            >
              Foto da Balança *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFoto(f);
                e.target.value = "";
              }}
            />
            {fotoPreview ? (
              <div className="relative">
                <img src={fotoPreview} alt="Balança" className="w-full h-32 object-cover rounded-lg" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "white" }}
                >
                  <RefreshCw size={11} /> Trocar
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 text-sm hover:bg-gray-50"
                style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}
              >
                <Camera size={16} /> Tirar foto / selecionar
              </button>
            )}
          </div>

          {/* IA */}
          {(validando || validacaoIA) && (
            <div
              className="rounded-lg px-3 py-2.5 text-[12px]"
              style={{
                backgroundColor: validando ? "#F9FAFB" : validacaoIA?.match ? "#ECFDF5" : "#FEF2F2",
                border: `1px solid ${validando ? "#E5E7EB" : validacaoIA?.match ? "#A7F3D0" : "#FECACA"}`,
              }}
            >
              {validando ? (
                <span className="flex items-center gap-2 text-gray-500">
                  <Loader2 size={13} className="animate-spin" /> Validando com IA…
                </span>
              ) : validacaoIA && (
                <div className="flex items-start gap-2">
                  {validacaoIA.match
                    ? <CheckCircle size={14} className="shrink-0 mt-0.5" style={{ color: iaColor }} />
                    : <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: iaColor }} />}
                  <div style={{ color: iaColor }}>
                    <p className="font-semibold">{validacaoIA.mensagem}</p>
                    {validacaoIA.peso_balanca != null && (
                      <p className="mt-0.5 text-[11px]">
                        Balança: {validacaoIA.peso_balanca.toFixed(3)}g · Informado: {pesoBrutoNum.toFixed(3)}g · Confiança: {validacaoIA.confianca}
                      </p>
                    )}
                    {!validacaoIA.match && fotoFile && (
                      <button
                        onClick={() => validarComIA(fotoFile, pesoBrutoNum)}
                        className="mt-1 underline text-[11px]"
                      >
                        Revalidar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {fotoFile && !validando && !validacaoIA && pesoBrutoNum > 0 && (
            <button
              onClick={() => validarComIA(fotoFile, pesoBrutoNum)}
              className="w-full py-2 rounded-lg text-[12px] font-semibold border flex items-center justify-center gap-2"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              <RefreshCw size={13} /> Validar com IA
            </button>
          )}

          {/* Pedras do lote */}
          {loadingPedras ? (
            <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Carregando pedras do lote…</p>
          ) : pedrasApontadas.length > 0 ? (
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: "#6B7280" }}
              >
                Pedras Utilizadas
                <span className="ml-2 font-normal normal-case">selecione do lote</span>
              </label>
              <div className="space-y-2">
                {pedrasApontadas.map((p) => {
                  const qtd = parseInt(pedrasQtd[p.insumo_id] || "0") || 0;
                  const pesoT = qtd * p.peso_pedra;
                  const excede = qtd > p.qtd_disponivel;
                  return (
                    <div
                      key={p.insumo_id}
                      className="rounded-lg p-3 border"
                      style={{
                        borderColor: excede ? "#FECACA" : C.cremeBorder,
                        backgroundColor: excede ? "#FEF2F2" : C.cremeBg,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold truncate" style={{ color: "#111827" }}>
                            {p.insumo_nome}
                          </span>
                          {p.sku && (
                            <span className="ml-1.5 text-[10px]" style={{ color: "#9CA3AF" }}>
                              ({p.sku})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] shrink-0 ml-2" style={{ color: excede ? "#DC2626" : "#6B7280" }}>
                          disp.: {p.qtd_disponivel} UN
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max={p.qtd_disponivel}
                          value={pedrasQtd[p.insumo_id] ?? "0"}
                          onChange={(e) => {
                            setPedrasQtd((prev) => ({ ...prev, [p.insumo_id]: e.target.value }));
                            setError("");
                          }}
                          className="w-20 px-2 py-1.5 rounded-md border text-sm font-mono text-center focus:outline-none"
                          style={{ borderColor: excede ? "#F87171" : C.cremeBorder }}
                        />
                        <span className="text-[11px]" style={{ color: "#6B7280" }}>
                          UN × {p.peso_pedra.toFixed(3)}g ={" "}
                          <span className="font-semibold" style={{ color: "#184036" }}>
                            {pesoT.toFixed(3)}g
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
              Nenhuma pedra apontada neste lote.
            </p>
          )}

          {/* Cálculo automático */}
          {pesoBrutoNum > 0 && (
            <div className="rounded-xl p-4 border" style={{ borderColor: "#E8DCC8", backgroundColor: "#FAFAF7" }}>
              <p
                className="text-[11px] font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#6B7280" }}
              >
                Cálculo Automático
              </p>
              <div className="space-y-1.5 text-[12px] font-mono">
                <div className="flex justify-between">
                  <span style={{ color: "#6B7280" }}>Peso bruto</span>
                  <span style={{ color: "#111827" }}>{pesoBrutoNum.toFixed(3)}g</span>
                </div>
                {pesoPedrasTotal > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: "#7C3AED" }}>
                      Pedras ({totalPedrasUn} UN)
                    </span>
                    <span style={{ color: "#7C3AED" }}>− {pesoPedrasTotal.toFixed(3)}g</span>
                  </div>
                )}
                <div
                  className="flex justify-between pt-1.5 border-t"
                  style={{ borderColor: "#E8DCC8" }}
                >
                  <span className="font-bold" style={{ color: "#184036" }}>
                    Ouro real na peça
                  </span>
                  <span
                    className="font-bold"
                    style={{ color: ouroReal >= 0 ? "#184036" : "#DC2626" }}
                  >
                    {ouroReal.toFixed(3)}g
                  </span>
                </div>

              </div>
              {ouroReal < 0 && (
                <p className="mt-2 text-[11px]" style={{ color: "#DC2626" }}>
                  ⚠️ Peso das pedras maior que o peso bruto.
                </p>
              )}
            </div>
          )}

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />Saída registrada com sucesso!
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!podeSalvar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading
              ? <><Loader2 size={14} className="animate-spin" />Salvando…</>
              : "📤 Registrar Saída"}
          </button>
        </div>
      </div>
    </div>
  );
}
