"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8" };

export type AcaoTipo = "entregar" | "receber" | "cliente_levou" | "solicitar_volta" | "confirmar_devolucao";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  solicitacaoId: number;
  tipo: AcaoTipo;
  produtosLabel: string;
  onSuccess?: () => void;
}

const CONFIG: Record<AcaoTipo, { titulo: string; subtitulo: string; label: string; foto: boolean; campo: string }> = {
  entregar:            { titulo: "Confirmar Entrega",     subtitulo: "Estoque separou e está entregando",  label: "Confirmar entrega",     foto: true,  campo: "entrega" },
  receber:             { titulo: "Confirmar Recebimento", subtitulo: "Você está recebendo a peça",         label: "Confirmar recebimento", foto: true,  campo: "recebimento" },
  cliente_levou:       { titulo: "Cliente Levou",         subtitulo: "A peça saiu de vez — encerra aqui",  label: "Confirmar",             foto: false, campo: "" },
  solicitar_volta:     { titulo: "Devolver ao Estoque",   subtitulo: "Mandar a peça de volta pro estoque", label: "Solicitar volta",       foto: false, campo: "" },
  confirmar_devolucao: { titulo: "Confirmar Devolução",   subtitulo: "Estoque recebeu a peça de volta",    label: "Confirmar devolução",   foto: true,  campo: "devolucao" },
};

export default function AcaoSolicitacaoModal({ isOpen, onClose, solicitacaoId, tipo, produtosLabel, onSuccess }: Props) {
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFotoFile(null); setFotoPreview(null); setError(""); setSuccess(false);
  }, [isOpen]);

  const cfg = CONFIG[tipo];
  const podeEnviar = cfg.foto ? !!fotoFile : true;

  async function handleSubmit() {
    setError("");
    if (cfg.foto && !fotoFile) { setError("Foto é obrigatória."); return; }
    setLoading(true);
    try {
      let foto_path: string | undefined;
      if (fotoFile) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const path = `movimentacao-interna/${cfg.campo}/${solicitacaoId}/${user?.id ?? "anon"}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("protocolo-fotos")
          .upload(path, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
        if (upErr) throw new Error(`Upload foto: ${upErr.message}`);
        foto_path = path;
      }
      const res = await fetch(`/api/solicitacao-peca/${solicitacaoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: tipo, foto_path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>{cfg.titulo}</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>#{solicitacaoId} · {cfg.subtitulo}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }}>
            {produtosLabel}
          </div>

          {cfg.foto && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Foto <span style={{ color: "#DC2626" }}>*</span>
              </p>
              {fotoPreview ? (
                <div className="relative rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
                  <button onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                    <RotateCcw size={13} color="white" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
                  style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#FAFAF7" }}>
                  <Camera size={22} style={{ color: "#9CA3AF" }} />
                  <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFotoFile(f); setFotoPreview(URL.createObjectURL(f)); } }} />
                </label>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Feito!
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={loading || success || !podeEnviar}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            {loading ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : cfg.label}
          </button>
        </div>
      </div>
    </div>
  );
}
