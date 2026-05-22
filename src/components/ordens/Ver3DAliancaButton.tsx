"use client";

/**
 * Botao "Ver 3D" exibido no detalhe da ordem de fabricacao (visao da fabrica).
 *
 * Carrega os parametros 3D da alianca via GET /api/ordens/[id]/ring-params
 * (que faz JOIN com o orcamento original) e, ao clicar, abre um modal com o
 * AliancaViewport — exatamente o mesmo visualizador usado na tela de orcamento,
 * mas apenas para visualizacao (sem editar).
 *
 * Se a ordem nao tem orcamento alianca associado, o botao simplesmente nao
 * aparece — o componente devolve null silenciosamente.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Box, Loader2, X } from "lucide-react";
import type { RingParams, ProfileType } from "@/app/(dashboard)/orcamento/types";

const AliancaViewport = dynamic(() => import("@/app/(dashboard)/orcamento/AliancaViewport"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center rounded-2xl" style={{ background: "#f1f5f9", border: "1px solid #E8DCC8" }}>
      <Loader2 size={28} className="animate-spin text-gray-300" />
    </div>
  ),
});

type RingViewerData = { profile: string; params: RingParams };
type ApiResp = { ring1: RingViewerData; ring2: RingViewerData | null; orcamento_id: number };

const C = {
  esmeralda: "#184036",
  cremeBorder: "#E8DCC8",
};

export default function Ver3DAliancaButton({ ordemId }: { ordemId: number }) {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/ordens/${ordemId}/ring-params`);
        if (cancelled) return;
        if (res.ok) {
          const json = (await res.json()) as ApiResp;
          setData(json);
        } else {
          setData(null);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ordemId]);

  if (loading || !data) return null;

  const hasPar = data.ring2 != null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg text-white transition-colors"
        style={{ background: C.esmeralda }}
        title="Abrir visualizador 3D da alianca"
      >
        <Box size={14} />
        Ver 3D{hasPar ? " (par)" : ""}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <Modal3D
          ring1={data.ring1}
          ring2={data.ring2}
          onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </>
  );
}

function Modal3D({
  ring1,
  ring2,
  onClose,
}: {
  ring1: RingViewerData;
  ring2: RingViewerData | null;
  onClose: () => void;
}) {
  // ESC fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col"
        style={{ height: "min(85vh, 720px)", borderColor: C.cremeBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: C.cremeBorder }}>
          <div className="flex items-center gap-2">
            <Box size={18} style={{ color: C.esmeralda }} />
            <h2 className="text-sm font-bold" style={{ color: C.esmeralda }}>
              Visualizacao 3D da Alianca {ring2 ? "(Par)" : ""}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Viewport(s) */}
        <div className="flex-1 flex gap-2 p-3" style={{ background: "#FAFAF7" }}>
          <div className="flex-1 relative rounded-xl overflow-hidden">
            {ring2 && (
              <div
                className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: C.esmeralda, color: "#fff" }}
              >
                Alianca 1
              </div>
            )}
            <AliancaViewport params={ring1.params} profile={ring1.profile as ProfileType} />
          </div>
          {ring2 && (
            <div className="flex-1 relative rounded-xl overflow-hidden">
              <div
                className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: C.esmeralda, color: "#fff" }}
              >
                Alianca 2
              </div>
              <AliancaViewport params={ring2.params} profile={ring2.profile as ProfileType} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t text-[11px] text-gray-500" style={{ borderColor: C.cremeBorder }}>
          Arraste pra girar · Scroll pra zoom · ESC ou clique fora pra fechar
        </div>
      </div>
    </div>
  );
}
