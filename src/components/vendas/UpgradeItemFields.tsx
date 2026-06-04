"use client";

import { useState } from "react";
import { Loader2, Scale, Camera, Info } from "lucide-react";

/**
 * REGRA DE NEGÓCIO: Produto Upgrade — campos de peso e foto da balança.
 * O QUE: Componente que renderiza os campos específicos do upgrade
 * (peso em gramas, foto da balança, resumo do cálculo) quando o produto
 * selecionado na venda é um upgrade.
 * POR QUE: O valor do upgrade é calculado como peso_gramas × valor_por_grama,
 * portanto o peso é obrigatório. A foto da balança garante rastreabilidade
 * do metal recebido do cliente.
 * IMPACTO SE REMOVIDO: Não há como informar peso/foto do upgrade na venda,
 * quebrando o fluxo de negócio.
 */

// Cores do design system da Alisson
const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

export interface UpgradeFieldsData {
  pesoGramas: number;
  fotoB64: string | null;
  fotoPreview: string | null;
  fotoPath: string | null;
}

interface UpgradeItemFieldsProps {
  valorPorGrama: number;
  quebraPercentual: number;
  pesoGramas: string;
  onPesoChange: (valor: string) => void;
  fotoB64: string | null;
  fotoPreview: string | null;
  fotoPath: string | null;
  uploadingFoto: boolean;
  onFotoChange: (b64: string | null, preview: string | null) => void;
  onFotoUpload: (b64: string) => Promise<string | null>;
  disabled?: boolean;
}

export function calcularUpgrade(pesoGramas: number, valorPorGrama: number, quebraPct: number) {
  const peso = pesoGramas || 0;
  const valorCalculado = Math.round(peso * valorPorGrama * 100) / 100;
  const pesoLiquido = Math.round(peso * (1 - quebraPct / 100) * 10000) / 10000;
  const pesoQuebra = Math.round(peso * (quebraPct / 100) * 10000) / 10000;
  return { valorCalculado, pesoLiquido, pesoQuebra };
}

export function fmtReal(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtGramas(v: number): string {
  return v.toFixed(2) + "g";
}

export default function UpgradeItemFields({
  valorPorGrama,
  quebraPercentual,
  pesoGramas,
  onPesoChange,
  fotoB64,
  fotoPreview,
  fotoPath,
  uploadingFoto,
  onFotoChange,
  onFotoUpload,
  disabled,
}: UpgradeItemFieldsProps) {
  const [localUploading, setLocalUploading] = useState(false);
  const peso = parseFloat(pesoGramas.replace(",", ".")) || 0;
  const { valorCalculado, pesoLiquido, pesoQuebra } = calcularUpgrade(peso, valorPorGrama, quebraPercentual);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview local
    const previewUrl = URL.createObjectURL(file);
    onFotoChange(null, previewUrl);

    // Converter para base64
    setLocalUploading(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      onFotoChange(b64, previewUrl);
      await onFotoUpload(b64);
    } catch {
      // Ignora erro — onFotoUpload já trata
    } finally {
      setLocalUploading(false);
    }
  };

  const clearFoto = () => {
    if (fotoPreview) URL.revokeObjectURL(fotoPreview);
    onFotoChange(null, null);
  };

  const isLoading = uploadingFoto || localUploading;

  return (
    <div className="space-y-3" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}`, borderRadius: "12px", padding: "16px" }}>
      {/* Peso do metal */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
          <Scale size={13} className="inline mr-1" style={{ color: C.esmeralda }} />
          Peso do Metal (g)
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={pesoGramas}
          onChange={e => onPesoChange(e.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="Ex: 10,50"
          disabled={disabled}
          className="w-full max-w-[200px] border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
          style={{
            borderColor: C.cremeBorder,
            fontFamily: "monospace",
          }}
        />
      </div>

      {/* Foto da balança */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: "#374151" }}>
          <Camera size={13} className="inline mr-1" style={{ color: C.esmeralda }} />
          Foto da Balança
          <span className="text-red-500 ml-0.5">*</span>
        </label>

        <label
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors w-full ${
            disabled ? "opacity-50 pointer-events-none" : "hover:bg-stone-50"
          }`}
          style={{ borderColor: fotoPath ? C.esmeralda : C.cremeBorder }}
        >
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
          {isLoading ? (
            <span className="flex items-center gap-2 text-sm" style={{ color: "#9CA3AF" }}>
              <Loader2 size={14} className="animate-spin" /> Enviando foto...
            </span>
          ) : fotoPath ? (
            <span className="text-sm font-medium" style={{ color: C.esmeralda }}>
              Foto enviada — toque para trocar
            </span>
          ) : (
            <span className="text-sm" style={{ color: "#6B7280" }}>
              Tirar foto ou selecionar da galeria
            </span>
          )}
        </label>

        {/* Preview da foto */}
        {fotoPreview && (
          <div className="relative w-fit mt-2">
            <img
              src={fotoPreview}
              alt="Balança"
              className="w-40 h-28 object-cover rounded-lg border"
              style={{ borderColor: C.cremeBorder }}
            />
            <button
              onClick={clearFoto}
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Resumo do cálculo */}
      {peso > 0 && (
        <div className="rounded-lg p-3 space-y-1.5" style={{ backgroundColor: "white", border: `1px solid ${C.cremeBorder}` }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#374151" }}>
            <Info size={12} className="inline mr-1" style={{ color: C.esmeralda }} />
            Resumo do Upgrade
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span style={{ color: "#6B7280" }}>Peso informado:</span>
            <span className="text-right font-mono font-medium" style={{ color: "#374151" }}>
              {fmtGramas(peso)}
            </span>

            <span style={{ color: "#6B7280" }}>Quebra ({quebraPercentual}%):</span>
            <span className="text-right font-mono font-medium" style={{ color: "#D97706" }}>
              −{fmtGramas(pesoQuebra)}
            </span>

            <span style={{ color: "#6B7280" }}>Peso líquido:</span>
            <span className="text-right font-mono font-medium" style={{ color: "#059669" }}>
              {fmtGramas(pesoLiquido)}
            </span>

            <span style={{ color: C.esmeralda, fontWeight: 600 }}>V/G:</span>
            <span className="text-right font-mono font-semibold" style={{ color: C.esmeralda }}>
              {fmtReal(valorPorGrama)}
            </span>

            <div className="col-span-2 border-t my-1" style={{ borderColor: C.cremeBorder }} />

            <span style={{ color: C.esmeralda, fontWeight: 700, fontSize: "13px" }}>Valor do Upgrade:</span>
            <span className="text-right font-mono font-bold text-sm" style={{ color: C.esmeralda }}>
              {fmtReal(valorCalculado)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
