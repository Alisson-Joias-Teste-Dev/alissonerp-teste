"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8" };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  protocoloId: number;
  produtos: string[];
  onSuccess?: () => void;
}

/**
 * REGRA DE NEGÓCIO: confirmar recebimento do protocolo interno — sem role,
 * sem PCP, sem aprovação. Só quem confirma (usuário logado) + foto obrigatória.
 */
export default function ConcluirProtocoloInternoModal({ isOpen, onClose, protocoloId, produtos, onSuccess }: Props) {
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFotoFile(null);
    setFotoPreview(null);
    setError("");
    setSuccess(false);
  }, [isOpen]);

  async function handleSubmit() {
    setError("");
    if (!fotoFile) { setError("Foto de confirmação é obrigatória."); return; }
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const fotoPath = `conclusao/${protocoloId}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      const res = await fetch(`/api/protocolo/${protocoloId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etapas: "concluido",
          recebedor_id: user?.id,
          foto_conclusao: fotoPath,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao confirmar recebimento");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Confirmar Recebimento</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Protocolo Interno #{protocoloId}</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "#9CA3AF" }}>
              <Package size={11} />
              Produtos ({produtos.length})
            </p>
            <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: `1px solid ${C.cremeBorder}`, color: "#374151" }}>
              {produtos.length > 0 ? produtos.join(", ") : "—"}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Foto de Confirmação <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
                <button
                  onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                >
                  <RotateCcw size={13} color="white" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
                style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: "#FAFAF7" }}
              >
                <Camera size={22} style={{ color: "#9CA3AF" }} />
                <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); }
                  }}
                />
              </label>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Recebimento confirmado!
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
          <button onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={loading || success || !fotoFile}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" />Confirmando...</> : "Confirmar Recebimento"}
          </button>
        </div>
      </div>
    </div>
  );
}
