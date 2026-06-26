"use client";

import { Check, Zap, Crown, Gift, Sparkles } from "lucide-react";
import { AVAILABLE_MODELS, type ModelId } from "@/lib/editor-ia/engine";

interface Props {
  selectedModels: ModelId[];
  onChange: (models: ModelId[]) => void;
  compareMode: boolean;
  onCompareModeChange: (enabled: boolean) => void;
}

const COST_ICON = {
  free:   { icon: Gift,      label: "Grátis",  color: "#8dc6a8" },
  low:    { icon: Zap,       label: "Baixo",   color: "#8dc6a8" },
  medium: { icon: Sparkles,  label: "Médio",   color: "#C9B377" },
  high:   { icon: Crown,     label: "Premium", color: "#1C4A3C" },
} as const;

export default function ModelSelector({
  selectedModels,
  onChange,
  compareMode,
  onCompareModeChange,
}: Props) {
  const toggle = (id: ModelId) => {
    if (compareMode) {
      onChange(selectedModels.includes(id) ? selectedModels.filter((m) => m !== id) : [...selectedModels, id]);
    } else {
      onChange([id]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toggle comparação */}
      <div className="flex items-center justify-between p-3 bg-neutral-50 border border-neutral-200 rounded-md">
        <div className="flex flex-col">
          <span className="text-[11px] uppercase tracking-[0.15em] text-neutral-700 font-medium">
            Modo Comparação (teste)
          </span>
          <span className="text-[10px] text-neutral-500 mt-0.5">
            Gera a mesma peça em múltiplos modelos
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = !compareMode;
            onCompareModeChange(next);
            if (!next && selectedModels.length > 1) onChange([selectedModels[0]]);
          }}
          className={`relative w-12 h-6 rounded-full transition-colors ${compareMode ? "bg-[#1C4A3C]" : "bg-neutral-300"}`}
          aria-label="Modo comparação"
        >
          <div
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              compareMode ? "translate-x-6" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-medium px-1">
          {compareMode ? "Selecione os modelos a comparar" : "Escolha o modelo"}
        </span>

        {AVAILABLE_MODELS.map((model) => {
          const isSelected = selectedModels.includes(model.id);
          const cost = COST_ICON[model.costLevel];
          const CostIcon = cost.icon;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => toggle(model.id)}
              className={`text-left p-3 border rounded-md transition-all ${
                isSelected
                  ? "border-[#1C4A3C] bg-[#1C4A3C]/5"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] text-neutral-900 font-medium">{model.name}</span>
                    {isSelected && <Check size={12} className="text-[#1C4A3C]" />}
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">{model.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1">
                      <CostIcon size={11} style={{ color: cost.color }} />
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: cost.color }}>
                        {cost.label}
                      </span>
                    </div>
                    {!model.supportsEdit && (
                      <span className="text-[10px] uppercase tracking-wider text-neutral-400">
                        • Só geração
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {compareMode && selectedModels.length > 0 && (
        <div className="text-[10px] text-neutral-600 text-center p-2 bg-neutral-100 rounded-md">
          {selectedModels.length} modelo{selectedModels.length > 1 ? "s" : ""} selecionado
          {selectedModels.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
