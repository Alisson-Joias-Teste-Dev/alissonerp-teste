"use client";

import { useEffect, useRef } from "react";
import type { Insumo } from "./types";

const C = {
  esmeralda:   "#184036",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

interface Props {
  insumos:          Insumo[];
  insumoId:         number | "";
  busca:            string;
  onBuscaChange:    (v: string) => void;
  dropdownAberto:   boolean;
  onDropdownChange: (v: boolean) => void;
  onSelecionar:     (insumo: Insumo) => void;
  onLimpar:         () => void;
  /** PCP destaca a linha ao passar o mouse; Distribuição não tinha esse efeito. */
  comHoverEffect?: boolean;
}

/**
 * Busca por nome/SKU com dropdown pra escolher um insumo de pedra — a lista
 * completa de pedras é grande demais pra um <select> simples. Usado nos
 * apontamentos de metal/pedra (Distribuição e PCP).
 */
export function InsumoPedraAutocomplete({
  insumos, insumoId, busca, onBuscaChange, dropdownAberto, onDropdownChange,
  onSelecionar, onLimpar, comHoverEffect,
}: Props) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) onDropdownChange(false);
    }
    function keyHandler(e: KeyboardEvent) { if (e.key === "Escape") onDropdownChange(false); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", keyHandler); };
  }, [onDropdownChange]);

  return (
    <div ref={dropdownRef} className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }}>🔍</span>
        <input
          type="text" placeholder="Buscar por nome ou SKU..."
          value={busca}
          onChange={(e) => {
            onBuscaChange(e.target.value); onDropdownChange(true);
            if (!e.target.value) onLimpar();
          }}
          onFocus={() => onDropdownChange(true)}
          className="w-full pl-8 pr-3 py-2.5 rounded-lg border text-sm focus:outline-none"
          style={{ borderColor: insumoId ? C.esmeralda : C.cremeBorder }}
        />
      </div>
      {dropdownAberto && (
        <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-y-auto"
          style={{ maxHeight: 220, backgroundColor: "#fff", border: `1px solid ${C.cremeBorder}` }}>
          {(() => {
            const q = busca.toLowerCase();
            const filtradas = insumos.filter((i) =>
              i.nome.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q)
            );
            if (filtradas.length === 0)
              return <p className="px-3 py-2.5 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma pedra encontrada</p>;
            return filtradas.map((i) => (
              <button key={i.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelecionar(i); }}
                className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
                style={{ borderBottom: `1px solid ${C.cremeBorder}`, backgroundColor: insumoId === i.id ? C.cremeBg : "transparent", ...(comHoverEffect ? { color: "#111827" } : {}) }}
                onMouseEnter={comHoverEffect ? (e) => { if (insumoId !== i.id) (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.cremeBg; } : undefined}
                onMouseLeave={comHoverEffect ? (e) => { if (insumoId !== i.id) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; } : undefined}
              >
                <span>
                  <span className="font-medium">{i.nome}</span>
                  {i.sku && <span className="ml-1.5 text-[11px]" style={{ color: "#9CA3AF" }}>({i.sku})</span>}
                </span>
                {i.saldo_disponivel !== undefined && (
                  <span className="text-[11px] shrink-0 ml-2" style={{ color: "#6B7280" }}>
                    {Math.round(Number(i.saldo_disponivel))} UN disp.
                  </span>
                )}
              </button>
            ));
          })()}
        </div>
      )}
      {insumos.length === 0 && <p className="text-[12px] mt-1.5" style={{ color: "#B45309" }}>Nenhuma pedra com saldo disponível no Almoxarifado Central.</p>}
    </div>
  );
}
