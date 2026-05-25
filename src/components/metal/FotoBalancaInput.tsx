"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-018: FotoBalancaInput — Upload de foto da balança com IA
//
// REGRA DE NEGÓCIO: A IA (Claude/Gemini/OpenAI) lê o display da balança
// de precisão e compara com o peso digitado. Tolerância: 0.005g para metal.
// Se NÃO bater, o sistema AVISA mas NÃO bloqueia — o usuário decide
// se prossegue. O peso lido pela IA é salvo no banco para auditoria.
//
// IMPACTO SE REMOVIDO: Sem validação IA, o funcionário pode digitar peso
// incorreto sem conferência, gerando inconsistência no estoque de ouro.
// ═══════════════════════════════════════════════════════════════════════════

type IaState = "idle" | "uploading" | "analyzing" | "success" | "mismatch" | "error";

interface IaResult {
  match: boolean;
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  mensagem: string;
  provedor: string;
}

interface FotoBalancaInputProps {
  pesoReferencia: number;
  onFotoChange: (base64: string, mediaType: string) => void;
  onIaResult: (result: IaResult | null) => void;
  /** Tolerância em gramas para comparação. Default: 0.005 */
  tolerancia?: number;
}

export default function FotoBalancaInput({
  pesoReferencia,
  onFotoChange,
  onIaResult,
  tolerancia = 0.005,
}: FotoBalancaInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [iaState, setIaState] = useState<IaState>("idle");
  const [iaFeedback, setIaFeedback] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | null) {
    if (!file) return;

    // Valida tipo
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      setIaState("error");
      setIaFeedback("Formato de imagem inválido. Use JPEG, PNG, WebP ou GIF.");
      return;
    }

    // Valida tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setIaState("error");
      setIaFeedback("Imagem muito grande. Máximo 10MB.");
      return;
    }

    const mediaType = file.type;

    // Preview
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      setPreview(`data:${mediaType};base64,${base64}`);
      onFotoChange(base64, mediaType);

      // IA estado
      setIaState("uploading");
      setIaFeedback("Enviando foto...");

      // Chama API de validação IA
      try {
        setIaState("analyzing");
        setIaFeedback("IA analisando peso na balança...");

        const res = await fetch("/api/ia/validar-peso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imagem_base64: base64,
            media_type: mediaType,
            peso_referencia: pesoReferencia,
            tipo: "metal",
            tolerancia,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Erro ao validar peso");
        }

        const result: IaResult = await res.json();
        onIaResult(result);

        if (result.match) {
          setIaState("success");
          setIaFeedback(result.mensagem);
        } else if (result.peso_balanca === null) {
          setIaState("error");
          setIaFeedback(result.mensagem);
        } else {
          setIaState("mismatch");
          setIaFeedback(result.mensagem);
        }
      } catch (err) {
        setIaState("error");
        setIaFeedback(
          err instanceof Error
            ? err.message
            : "Erro ao conectar com a IA. Tente novamente.",
        );
        onIaResult(null);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const iaColors: Record<IaState, string> = {
    idle: "border-[#C59B6D]/30",
    uploading: "border-blue-300",
    analyzing: "border-purple-300",
    success: "border-emerald-400 bg-emerald-50",
    mismatch: "border-amber-400 bg-amber-50",
    error: "border-red-300 bg-red-50",
  };

  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1">
        Foto da Balança
      </label>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={`relative bg-white border-2 border-dashed rounded-xl p-4 text-center cursor-pointer
          transition-all hover:border-[#C59B6D] hover:bg-[#F2E8D5]/20 ${iaColors[iaState]}`}
      >
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Preview da balança"
              className="max-h-48 mx-auto rounded-lg object-contain"
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreview(null);
                setIaState("idle");
                setIaFeedback("");
                onFotoChange("", "");
                onIaResult(null);
              }}
              className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
            >
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4">
            <Camera size={32} className="text-[#C59B6D]" />
            <p className="text-xs text-[#1A3C34]/60">
              Clique para tirar foto ou fazer upload
            </p>
            <p className="text-[10px] text-[#1A3C34]/40">
              JPEG, PNG, WebP • Máx 10MB
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          capture="environment"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </div>

      {/* IA Feedback */}
      {(iaState === "uploading" || iaState === "analyzing") && (
        <div className="flex items-center gap-2 text-xs text-[#1A3C34]/70 px-2">
          <Loader2 size={14} className="animate-spin" />
          {iaFeedback}
        </div>
      )}

      {iaState === "success" && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
          <CheckCircle2 size={14} />
          {iaFeedback}
        </div>
      )}

      {iaState === "mismatch" && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertTriangle size={14} />
          <span>
            {iaFeedback}
            <br />
            <strong>Você pode prosseguir mesmo assim.</strong>
          </span>
        </div>
      )}

      {iaState === "error" && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <XCircle size={14} />
          {iaFeedback}
        </div>
      )}
    </div>
  );
}
