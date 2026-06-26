"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RefreshCw, AlertTriangle } from "lucide-react";
import { gramasToCt, formatPesoCt } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";

const MOTIVOS_SEM_PESO = [
  { value: "servico_cliente", label: "Serviço — peça do cliente" },
  { value: "sem_ouro", label: "Sem ouro — só pedras/acabamento" },
  { value: "fundicao_falha", label: "Problema de fundição — metal retornado" },
  { value: "cancelada", label: "Ordem cancelada" },
  { value: "outro", label: "Outro motivo" },
] as const;

type MotivoSemPeso = (typeof MOTIVOS_SEM_PESO)[number]["value"];

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
  const [pesoGPedras, setPesoGPedras] = useState<Record<number, string>>({}); // insumo_id → gramas
  const [loadingPedras, setLoadingPedras] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Saída sem peso ───────────────────────────────────────────────────────
  const [semPeso, setSemPeso] = useState(false);
  const [motivo, setMotivo] = useState<MotivoSemPeso | "">("");
  const [obsMotivo, setObsMotivo] = useState("");

  function resetForm() {
    setPeso(""); setPedrasQtd({}); setPesoGPedras({}); setError(""); setSuccess(false);
    setFotoFile(null); setFotoPreview(null); setValidacaoIA(null); setValidando(false);
    setSemPeso(false); setMotivo(""); setObsMotivo("");
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
        const initG: Record<number, string> = {};
        lista.forEach((p) => {
          init[p.insumo_id] = "0";
          initG[p.insumo_id] = "";
        });
        setPedrasQtd(init);
        setPesoGPedras(initG);
      })
      .catch(() => setPedrasApontadas([]))
      .finally(() => setLoadingPedras(false));
  }, [isOpen, ordem?.id]); // eslint-disable-line

  // Reset IA ao mudar peso bruto
  useEffect(() => { if (validacaoIA) setValidacaoIA(null); }, [peso]); // eslint-disable-line

  // ─── Cálculos em tempo real ───────────────────────────────────────────────
  const pesoBrutoNum = parseFloat(peso) || 0;

  const pesoPedrasTotal = pedrasApontadas.reduce((sum, p) => {
    const gStr = pesoGPedras[p.insumo_id];
    if (gStr !== undefined && gStr !== "") {
      return sum + (parseFloat(gStr) || 0);
    }
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

    // ── Validação sem peso ──────────────────────────────────────────────────
    if (semPeso) {
      if (!motivo) { setError("Selecione o motivo da saída sem peso."); return; }
      if (motivo === "outro" && !obsMotivo.trim()) {
        setError("Descreva o motivo da saída sem peso.");
        return;
      }

      const labelMotivo = MOTIVOS_SEM_PESO.find((m) => m.value === motivo)?.label ?? motivo;
      const justificativa = motivo === "outro"
        ? `Outro: ${obsMotivo.trim()}`
        : `${labelMotivo}${obsMotivo.trim() ? ` — ${obsMotivo.trim()}` : ""}`;

      setLoading(true);
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const res = await fetch(`/api/distribuicao/${distribuicaoId}/saida`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ordem_id: ordem.id,
          sem_peso: true,
          justificativa_sem_peso: justificativa,
          user_id: user?.id ?? null,
        }),
      });

      setLoading(false);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Erro ao registrar saída sem peso.");
        return;
      }

      setSuccess(true);
      setTimeout(() => { resetForm(); onSuccess?.(); onClose(); }, 1500);
      return;
    }

    // ── Validação normal ────────────────────────────────────────────────────
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
      const gStr = pesoGPedras[p.insumo_id];
      const pesoG = gStr && gStr !== "" ? (parseFloat(gStr) || 0) : 0;
      const maxG = p.qtd_disponivel * (p.peso_pedra ?? 0);
      if (pesoG > maxG + 0.0001) {
        setError(`"${p.insumo_nome}" excede o disponível (${maxG.toFixed(4)}g).`);
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
      .map((p) => {
        const gStr = pesoGPedras[p.insumo_id];
        const pesoG = gStr && gStr !== "" ? (parseFloat(gStr) || 0) : 0;
        const peso_ct_utilizado = pesoG > 0 ? gramasToCt(pesoG) : 0;
        return {
          insumo_id: p.insumo_id,
          peso_ct_utilizado,
          qtd_utilizada: parseInt(pedrasQtd[p.insumo_id] || "0") || 0,
        };
      })
      .filter((p) => p.peso_ct_utilizado > 0 || p.qtd_utilizada > 0);

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
  const podeSalvarNormal = !loading && !success && pesoBrutoNum > 0 && fotoOk;
  const podeSalvarSemPeso = !loading && !success && !!motivo && (motivo !== "outro" || !!obsMotivo.trim());
  const podeSalvar = semPeso ? podeSalvarSemPeso : podeSalvarNormal;
  const iaColor = validacaoIA?.match ? "#059669" : "#DC2626";

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
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
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
          {/* Checkbox: Saída sem peso */}
          <label
            className="flex items-start gap-3 cursor-pointer rounded-xl border p-3 transition-colors"
            style={{
              borderColor: semPeso ? "#FCD34D" : "#E8DCC8",
              backgroundColor: semPeso ? "#FFFBEB" : "#FAFAF7",
            }}
          >
            <input
              type="checkbox"
              checked={semPeso}
              onChange={(e) => {
                setSemPeso(e.target.checked);
                setMotivo("");
                setObsMotivo("");
                setError("");
              }}
              className="mt-0.5 h-4 w-4 rounded accent-amber-500 cursor-pointer"
            />
            <div>
              <p className="text-[13px] font-semibold" style={{ color: semPeso ? "#92400E" : "#374151" }}>
                Saída sem peso
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: semPeso ? "#B45309" : "#9CA3AF" }}>
                Serviço do cliente, sem ouro, cancelada ou fundição falhou
              </p>
            </div>
          </label>

          {/* Campos quando sem_peso = true */}
          {semPeso && (
            <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "#FCD34D", backgroundColor: "#FFFBEB" }}>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} style={{ color: "#B45309" }} />
                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "#B45309" }}>
                  Motivo obrigatório
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Motivo *
                </label>
                <select
                  value={motivo}
                  onChange={(e) => { setMotivo(e.target.value as MotivoSemPeso | ""); setError(""); }}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none bg-white"
                  style={{ borderColor: "#FCD34D" }}
                >
                  <option value="">Selecione…</option>
                  {MOTIVOS_SEM_PESO.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  Observação {motivo === "outro" ? "*" : "(opcional)"}
                </label>
                <textarea
                  value={obsMotivo}
                  onChange={(e) => { setObsMotivo(e.target.value); setError(""); }}
                  placeholder={motivo === "outro" ? "Descreva o motivo…" : "Detalhes adicionais (opcional)"}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                  style={{ borderColor: "#FCD34D" }}
                />
              </div>
            </div>
          )}

          {/* Campos normais — ocultos quando sem_peso */}
          {!semPeso && (<>
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
                  const maxG = p.qtd_disponivel * (p.peso_pedra ?? 0);
                  const saldoCt = gramasToCt(maxG);
                  const gInput = pesoGPedras[p.insumo_id] ?? "";
                  const pesoGNum = parseFloat(gInput) || 0;
                  const excede = pesoGNum > maxG + 0.0001;
                  const ctDisplay = pesoGNum > 0 ? gramasToCt(pesoGNum) : null;
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
                          disp.: {formatPesoCt(saldoCt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={gInput}
                          onChange={(e) => {
                            setPesoGPedras((prev) => ({ ...prev, [p.insumo_id]: e.target.value }));
                            setError("");
                          }}
                          className="w-24 px-2 py-1.5 rounded-md border text-sm font-mono text-right focus:outline-none"
                          style={{ borderColor: excede ? "#F87171" : C.cremeBorder }}
                          placeholder="0.00"
                        />
                        <span className="text-[11px] w-4" style={{ color: "#9CA3AF" }}>g</span>
                        {ctDisplay !== null && ctDisplay > 0 && (
                          <span className="text-[11px] font-semibold" style={{ color: "#7C3AED" }}>
                            = {ctDisplay.toFixed(4)} ct
                          </span>
                        )}
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
                      Pedras ({gramasToCt(pesoPedrasTotal).toFixed(4)} ct)
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
          </>)}

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
