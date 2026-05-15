"use client";

import { Check } from "lucide-react";
import { LAYER_3_SCENES } from "@/lib/editor-ia/prompts";

interface Props {
  selectedSceneIds: string[];
  onChange: (ids: string[]) => void;
  multiSelect?: boolean;
}

export default function SceneSelector({ selectedSceneIds, onChange, multiSelect = true }: Props) {
  const toggle = (id: string) => {
    if (multiSelect) {
      onChange(selectedSceneIds.includes(id) ? selectedSceneIds.filter((s) => s !== id) : [...selectedSceneIds, id]);
    } else {
      onChange([id]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-medium">
          Cenários ({selectedSceneIds.length})
        </span>
        {multiSelect && (
          <button
            type="button"
            onClick={() =>
              onChange(
                selectedSceneIds.length === LAYER_3_SCENES.length ? [] : LAYER_3_SCENES.map((s) => s.id),
              )
            }
            className="text-[10px] uppercase tracking-wider text-[#1C4A3C] hover:underline"
          >
            {selectedSceneIds.length === LAYER_3_SCENES.length ? "Limpar" : "Todos"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LAYER_3_SCENES.map((scene) => {
          const isSelected = selectedSceneIds.includes(scene.id);
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => toggle(scene.id)}
              className={`text-left p-3 border rounded-md transition-all ${
                isSelected
                  ? "border-[#1C4A3C] bg-[#1C4A3C]/5"
                  : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-900 font-medium leading-tight">{scene.name}</span>
                {isSelected && <Check size={11} className="text-[#1C4A3C]" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
