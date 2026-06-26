"use client";

import { useState, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Info, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conversao: any;
  onSuccess?: () => void;
}

export default function ConcluirConversaoSkuModal({ isOpen, onClose, conversao, onSuccess }: Props) {
  const [pesoFinal, setPesoFinal] = useState("");
  const [qtdProduzida, setQtdProduzida] = useState("");
  const [fotoBalancaFile, setFotoBalancaFile] = useState<File | null>(null);
  const [fotoBalancaPreview, setFotoBalancaPreview] = useState<string | null>(null);
  const [pesoSobra, setPesoSobra] = useState("");
  const [fotoSobraFile, setFotoSobraFile] = useState<File | null>(null);
  const [fotoSobraPreview, setFotosSobraPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [iaChecking, setIaChecking] = useState(false);
  const [iaBalanca, setIaBalanca] = useState<{ match: boolean; peso_balanca?: number | null } | null>(null);
  const [iaSobra, setIaSobra] = useState<{ match: boolean; peso_balanca?: number | null } | null>(null);

  // Sobra calculada (live)
  const pesoOrigem = parseFloat(conversao?.sku_origem_peso) || 0;
  const pesoFinalNum = parseFloat(pesoFinal) || 0;
  const sobraCalculada = Math.max(pesoOrigem - pesoFinalNum, 0);
  const pesoSobraNum = parseFloat(pesoSobra) || 0;
  const quebra = Math.max(sobraCalculada - pesoSobraNum, 0);

  async function validarPesoIA(file: File, pesoRef: number, field: "balanca" | "sobra"): Promise<boolean> {
    setIaChecking(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/ia/validar-peso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagem_base64: base64,
          peso_referencia: pesoRef,
          tolerancia: 0.1,
          media_type: "image/jpeg",
        }),
      });
      const data = await res.json();
      if (field === "balanca") setIaBalanca(data);
      else setIaSobra(data);
      return data.match;
    } catch {
      return true;
    } finally {
      setIaChecking(false);
    }
  }

  async function handleSubmit() {
    setError("");

    if (!pesoFinal || pesoFinalNum <= 0) { setError("Peso final é obrigatório"); return; }
    if (!qtdProduzida || parseInt(qtdProduzida) <= 0) { setError("Quantidade produzida é obrigatória"); return; }
    if (!fotoBalancaFile) { setError("Foto da balança é obrigatória"); return; }

    // Validar IA
    const balancaOk = await validarPesoIA(fotoBalancaFile, pesoFinalNum, "balanca");
    if (!balancaOk) { setError("Peso final não confirmado pela IA. Verifique a foto da balança."); return; }

    if (fotoSobraFile && pesoSobraNum > 0) {
      const sobraOk = await validarPesoIA(fotoSobraFile, pesoSobraNum, "sobra");
      if (!sobraOk) { setError("Peso da sobra não confirmado pela IA."); return; }
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const toBase64 = (f: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      const res = await fetch("/api/conversao-sku/concluir-servico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversao_sku_id: conversao.id,
          peso_final: pesoFinalNum,
          quantidade_produzida: parseInt(qtdProduzida),
          foto_balanca_base64: await toBase64(fotoBalancaFile),
          peso_sobra_real: sobraCalculada > 0 ? pesoSobraNum : 0,
          foto_sobra_base64: fotoSobraFile ? await toBase64(fotoSobraFile) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao concluir");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setError(""); setSuccess(false);
    setFotoBalancaFile(null); setFotoBalancaPreview(null);
    setFotosSobraPreview(null); setFotoSobraFile(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Executar Conversão SKU</h3>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Resumo da conversão */}
          <div className="rounded-xl p-3" style={{ border: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}>
            <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
              <strong>{conversao.sku_origem_nome}</strong> ({conversao.sku_origem_cod})
              <br />{conversao.sku_origem_quantidade} un · {conversao.sku_origem_peso}g
              <br /><span style={{ color: "#7C3AED" }}>→</span> <strong>{conversao.sku_destino_nome}</strong> ({conversao.sku_destino_cod})
              <br />Qtd desejada: {conversao.sku_destino_quantidade_desejada}
            </div>
          </div>

          {/* Resultado */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#7C3AED" }}>
              Resultado da Conversão
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Peso Final (g) <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="number" step="0.01" min="0.01" value={pesoFinal} onChange={e => setPesoFinal(e.target.value)}
                  placeholder="ex: 4.5"
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                  Qtd Produzida <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="number" min="1" value={qtdProduzida} onChange={e => setQtdProduzida(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white"
                  style={{ borderColor: C.cremeBorder }} />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                Foto da Balança <span style={{ color: "#DC2626" }}>*</span>
              </label>
              {fotoBalancaPreview ? (
                <div className="relative rounded-xl overflow-hidden max-h-32">
                  <img src={fotoBalancaPreview} alt="Balança" className="w-full max-h-32 object-cover rounded-xl" />
                  <button onClick={() => { setFotoBalancaFile(null); setFotoBalancaPreview(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <RotateCcw size={13} color="white" />
                  </button>
                  {iaBalanca && (
                    <div style={{
                      position: "absolute", bottom: 8, left: 8,
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 999,
                      backgroundColor: iaBalanca.match ? "rgba(5,150,99,0.85)" : "rgba(220,38,38,0.85)",
                      color: "#fff", fontSize: 10,
                    }}>
                      <ShieldCheck size={10} />
                      {iaBalanca.match ? `${iaBalanca.peso_balanca}g ✓` : "Peso difere"}
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-20 rounded-xl cursor-pointer transition-colors"
                  style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#fff" }}>
                  <Camera size={18} style={{ color: "#9CA3AF" }} />
                  <span className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>Foto da balança</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const file = e.target.files?.[0]; if (file) { setFotoBalancaFile(file); setFotoBalancaPreview(URL.createObjectURL(file)); } }} />
                </label>
              )}
            </div>
          </div>

          {/* Sobra */}
          {sobraCalculada > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Sobra <span style={{ color: "#6B7280" }}>(calculada: {sobraCalculada.toFixed(3)}g)</span>
              </p>

              <div className="rounded-xl p-3 mb-2 flex items-start gap-2" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <Info size={14} style={{ color: "#92400E", marginTop: 1 }} />
                <p className="text-[11px]" style={{ color: "#92400E" }}>
                  Pese a sobra (restante que não virou SKU destino). A diferença entre a sobra calculada e a sobra real vira quebra do operador.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                    Peso da Sobra (g)
                  </label>
                  <input type="number" step="0.01" min="0" value={pesoSobra} onChange={e => setPesoSobra(e.target.value)}
                    placeholder="ex: 0.5"
                    className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white"
                    style={{ borderColor: C.cremeBorder }} />
                </div>
              </div>

              {pesoSobraNum > 0 && (
                <div className="mt-3">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                    Foto da Sobra
                  </label>
                  {fotoSobraPreview ? (
                    <div className="relative rounded-xl overflow-hidden max-h-32">
                      <img src={fotoSobraPreview} alt="Sobra" className="w-full max-h-32 object-cover rounded-xl" />
                      <button onClick={() => { setFotoSobraFile(null); setFotosSobraPreview(null); }}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                        <RotateCcw size={13} color="white" />
                      </button>
                      {iaSobra && (
                        <div style={{
                          position: "absolute", bottom: 8, left: 8,
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 999,
                          backgroundColor: iaSobra.match ? "rgba(5,150,99,0.85)" : "rgba(220,38,38,0.85)",
                          color: "#fff", fontSize: 10,
                        }}>
                          <ShieldCheck size={10} />
                          {iaSobra.match ? `${iaSobra.peso_balanca}g ✓` : "Peso difere"}
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-20 rounded-xl cursor-pointer transition-colors"
                      style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#fff" }}>
                      <Camera size={18} style={{ color: "#9CA3AF" }} />
                      <span className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>Foto da sobra</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => { const file = e.target.files?.[0]; if (file) { setFotoSobraFile(file); setFotosSobraPreview(URL.createObjectURL(file)); } }} />
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resumo dos cálculos */}
          {pesoFinalNum > 0 && (
            <div className="rounded-xl p-3 space-y-1" style={{ backgroundColor: "#1840360D" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#6B7280" }}>Peso original</span>
                <span style={{ color: "#374151", fontWeight: 500 }}>{pesoOrigem.toFixed(3)}g</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#6B7280" }}>Peso final</span>
                <span style={{ color: "#374151", fontWeight: 500 }}>{pesoFinalNum.toFixed(3)}g</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#6B7280" }}>Sobra calculada</span>
                <span style={{ color: "#374151", fontWeight: 500 }}>{sobraCalculada.toFixed(3)}g</span>
              </div>
              {pesoSobraNum > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#6B7280" }}>Sobra real (pesada)</span>
                    <span style={{ color: "#374151", fontWeight: 500 }}>{pesoSobraNum.toFixed(3)}g</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: `1px solid ${C.cremeBorder}`, paddingTop: 4 }}>
                    <span style={{ color: "#DC2626" }}>Quebra do operador</span>
                    <span style={{ color: "#DC2626", fontWeight: 700 }}>{quebra.toFixed(3)}g</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Conversão concluída! Aguardando protocolo volta.
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button onClick={handleClose} className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center" style={{ color: "#6B7280" }}>Cancelar</button>
            <button onClick={handleSubmit}
              disabled={loading || success || !pesoFinal || !qtdProduzida || !fotoBalancaFile}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: "#7C3AED", color: C.creme, minHeight: 44 }}>
              {loading ? <><Loader2 size={14} className="animate-spin" />Concluindo...</> : "Concluir Conversão"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
