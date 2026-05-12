"use client";

import Link from "next/link";
import { Plus, ArrowRight, LogOut, UserCheck } from "lucide-react";
import type React from "react";

// ─── Constantes compartilhadas ─────────────────────────────────────────────
// Etapas (label do vw_pcp_erp.etapas) onde cada ação faz sentido.
export const ETAPAS_APONTAMENTO   = new Set(["Novas Ordens", "Em Andamento"]);
export const ETAPAS_TRANSFERENCIA = new Set(["Novas Ordens", "Em Andamento"]);
export const ETAPAS_SAIDA         = new Set(["Em Andamento"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PCPItem = any;

interface KanbanCardProps {
  pcp:          PCPItem;
  onDetalhe:    (pcp: PCPItem) => void;
  onApontar:    (pcp: PCPItem) => void;
  onTransferir: (pcp: PCPItem) => void;
  onSaida:      (pcp: PCPItem) => void;
  onAtribuir:   (pcp: PCPItem) => void;
  /** Habilita drag-and-drop HTML5 — usado no kanban de Rota de Fabricação. */
  draggable?:   boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, pcp: PCPItem) => void;
  onDragEnd?:   (e: React.DragEvent<HTMLDivElement>) => void;
  /** Badges extras (ex: "REPO" pra OFs de reposição automática). */
  extraBadges?: React.ReactNode;
}

export default function KanbanCard({
  pcp,
  onDetalhe,
  onApontar,
  onTransferir,
  onSaida,
  onAtribuir,
  draggable = false,
  onDragStart,
  onDragEnd,
  extraBadges,
}: KanbanCardProps) {
  const etapa          = pcp.etapas ?? "";
  const podeApontar    = ETAPAS_APONTAMENTO.has(etapa);
  const podeTransferir = ETAPAS_TRANSFERENCIA.has(etapa);
  const podeSaida      = ETAPAS_SAIDA.has(etapa);
  const podeAtribuir   = pcp.deposito_id == null && etapa === "Novas Ordens";

  return (
    <div
      onClick={() => onDetalhe(pcp)}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, pcp)}
      onDragEnd={onDragEnd}
      className="bg-white rounded-lg border p-3 text-xs shadow-sm hover:shadow-md hover:ring-1 transition-all cursor-pointer"
      style={{
        borderColor: "#E8DCC8",
        "--tw-ring-color": "#18403630",
        cursor: draggable ? "grab" : "pointer",
      } as React.CSSProperties}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Link
          href={`/ordens/${pcp.ordem_id}`}
          className="font-semibold text-sm hover:underline"
          style={{ color: "#184036" }}
          title="Ver detalhes da ordem"
          onClick={(e) => e.stopPropagation()}
        >
          {pcp.numero_ordem ?? `#${pcp.ordem_id}`}
        </Link>
        <div className="flex items-center gap-1.5">
          {extraBadges}
          {pcp.na_service && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA" }}
            >
              Na service
            </span>
          )}
          {pcp.eh_teste && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              🧪
            </span>
          )}
          {Number(pcp.total_apontamentos) > 0 && (
            <span
              className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "#18403620", color: "#184036" }}
            >
              {pcp.total_apontamentos} apt
            </span>
          )}
          <span className="font-mono text-[10px]" style={{ color: "#6B7280" }}>
            #{pcp.id}
          </span>
        </div>
      </div>

      {pcp.cliente_nome && (
        <p className="truncate mb-1" style={{ color: "#1A1A1A" }}>
          {pcp.cliente_nome}
        </p>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "#F3EADA" }}>
        <span style={{ color: "#6B7280" }}>{pcp.vendedor_nome ?? "—"}</span>
        {Number(pcp.peso_final) > 0 ? (
          <span className="font-mono font-semibold" style={{ color: "#DB9864" }}>
            {Number(pcp.peso_final).toFixed(2)}g
          </span>
        ) : (
          <span style={{ color: "#9CA3AF" }}>—</span>
        )}
      </div>

      {pcp.deposito_nome && (
        <div className="mt-1.5 text-[10px] font-medium truncate" style={{ color: "#6B7280" }}>
          👤 {pcp.deposito_nome}
        </div>
      )}

      {(podeApontar || podeTransferir || podeSaida || podeAtribuir) && (
        <div className="mt-2 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          {podeAtribuir && (
            <button
              onClick={() => onAtribuir(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#7C3AED12", color: "#7C3AED" }}
            >
              <UserCheck size={11} strokeWidth={2.5} />
              Atribuir Operador
            </button>
          )}
          {podeApontar && (
            <button
              onClick={() => onApontar(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#18403612", color: "#184036" }}
            >
              <Plus size={11} strokeWidth={2.5} />
              Apontar
            </button>
          )}
          {podeTransferir && (
            <button
              onClick={() => onTransferir(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#0EA5E912", color: "#0284C7" }}
            >
              <ArrowRight size={11} strokeWidth={2.5} />
              Transferir
            </button>
          )}
          {podeSaida && (
            <button
              onClick={() => onSaida(pcp)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: "#F59E0B12", color: "#B45309" }}
            >
              <LogOut size={11} strokeWidth={2.5} />
              Saída
            </button>
          )}
        </div>
      )}
    </div>
  );
}
