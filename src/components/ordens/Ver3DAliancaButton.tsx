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
import { Box, Loader2, X, AlertCircle, RefreshCw } from "lucide-react";
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

// Estados possiveis da busca pelo 3D:
//   - loading: fetch em andamento
//   - ok: API respondeu com dados (botao verde)
//   - no-data: ordem nao tem orcamento alianca (componente fica oculto, sem feedback)
//   - error: falha de rede / erro 500 (botao amarelo com opcao de tentar novamente)
type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; data: ApiResp }
  | { kind: "no-data" }
  | { kind: "error" };

export default function Ver3DAliancaButton({ ordemId }: { ordemId: number }) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const res = await fetch(`/api/ordens/${ordemId}/ring-params`);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as ApiResp;
          setState({ kind: "ok", data });
        } else if (res.status === 404) {
          // 404 = ordem nao tem orcamento alianca associado (legitimo).
          setState({ kind: "no-data" });
        } else {
          setState({ kind: "error" });
        }
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [ordemId, retryToken]);

  if (state.kind === "loading" || state.kind === "no-data") return null;

  if (state.kind === "error") {
    return (
      <button
        onClick={() => setRetryToken(t => t + 1)}
        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors"
        style={{ borderColor: "#F59E0B", color: "#92400E", background: "#FEF3C7" }}
        title="Falha ao carregar 3D — clique para tentar de novo"
      >
        <AlertCircle size={14} /> 3D indisponivel <RefreshCw size={12} />
      </button>
    );
  }

  const hasPar = state.data.ring2 != null;

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
          ring1={state.data.ring1}
          ring2={state.data.ring2}
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

  // Bug fix: o Canvas do react-three-fiber é montado via dynamic({ssr:false})
  // dentro de createPortal. No primeiro paint o ResizeObserver do r3f mede o
  // container ANTES do layout flex resolver, e o canvas trava em 300×150
  // (default). Sem este nudge, ourives clica "Ver 3D" e vê retângulo vazio.
  // Disparar `resize` faz o r3f recalcular gl.setSize com a área real.
  useEffect(() => {
    const t1 = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    const t2 = setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

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
