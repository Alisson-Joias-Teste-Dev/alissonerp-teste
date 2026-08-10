"use client";

import { useRef } from "react";
import { Camera, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import type { ValidacaoIA } from "./useValidacaoIABalanca";

const C = {
  esmeralda:   "#184036",
  sage:        "#80A795",
  cremeBorder: "#E8DCC8",
};

interface Props {
  fotoPreview:   string | null;
  validando:     boolean;
  validacaoIA:   ValidacaoIA | null;
  onFotoChange:  (file: File) => void;
  onRevalidar:   () => void;
  /** Texto abaixo do botão de tirar foto — Dist não mostra, PCP mostra "Câmera ou galeria". */
  subtitleBotao?: string;
  /** Texto do estado "analisando" — cada tela usa uma frase levemente diferente. */
  textoAnalisando?: string;
}

/**
 * Campo de foto da balança + resultado da validação por IA. Usado nos
 * apontamentos de metal/pedra (Distribuição e PCP) — ver useValidacaoIABalanca
 * pra regra de negócio da validação em si.
 */
export function FotoBalancaCampo({
  fotoPreview, validando, validacaoIA, onFotoChange, onRevalidar,
  subtitleBotao, textoAnalisando = "Analisando peso...",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#6B7280" }}>
        Foto da Balança <span style={{ color: "#EF4444" }}>*</span>
      </label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFotoChange(f); e.target.value = ""; }}
      />

      {!fotoPreview ? (
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed"
          style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
          <Camera size={28} style={{ color: C.sage }} />
          <span className="text-[13px]">Tirar foto da balança</span>
          {subtitleBotao && <span className="text-[11px]">{subtitleBotao}</span>}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden" style={{ height: 180 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fotoPreview} alt="Foto balança" className="w-full h-full object-cover" />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}>
              <RefreshCw size={11} /> Trocar foto
            </button>
          </div>

          {validando && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}>
              <Loader2 size={14} className="animate-spin shrink-0" /> {textoAnalisando}
            </div>
          )}

          {!validando && validacaoIA && (
            <div className="px-3 py-2.5 rounded-lg text-[13px]"
              style={validacaoIA.match ? { backgroundColor: "#ECFDF5", color: "#065F46" } : { backgroundColor: "#FEF2F2", color: "#991B1B" }}>
              <div className="flex items-center gap-2 font-semibold mb-0.5">
                {validacaoIA.match ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                {validacaoIA.mensagem}
              </div>
              <span className="text-[11px] opacity-70">Confiança: {validacaoIA.confianca}</span>
            </div>
          )}

          {!validando && !validacaoIA && (
            <button type="button" onClick={onRevalidar}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold border"
              style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
              <RefreshCw size={13} /> Validar com IA
            </button>
          )}
        </div>
      )}
    </div>
  );
}
