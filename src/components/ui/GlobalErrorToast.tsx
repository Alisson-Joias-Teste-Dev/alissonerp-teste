"use client";

import { useEffect } from "react";
import { AlertTriangle, X, AlertCircle, Info, XCircle } from "lucide-react";
import { useErrorStore, type GlobalError } from "@/stores/errorStore";

const LEVEL_CONFIG = {
  critical: {
    bg:     "#7F1D1D",
    border: "#991B1B",
    icon:   <XCircle size={18} className="shrink-0 text-red-200" />,
    label:  "Erro",
  },
  warning: {
    bg:     "#78350F",
    border: "#92400E",
    icon:   <AlertTriangle size={18} className="shrink-0 text-yellow-200" />,
    label:  "Atenção",
  },
  info: {
    bg:     "#1E3A5F",
    border: "#1D4ED8",
    icon:   <Info size={18} className="shrink-0 text-blue-200" />,
    label:  "Info",
  },
};

function ErrorCard({ err, onDismiss }: { err: GlobalError; onDismiss: () => void }) {
  const cfg = LEVEL_CONFIG[err.level];

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl max-w-sm w-full text-white text-sm pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {cfg.icon}

      <div className="flex-1 min-w-0">
        <p className="font-semibold leading-tight">{err.message}</p>
        {err.detail && (
          <p className="text-xs mt-0.5 opacity-75 break-words">{err.detail}</p>
        )}
        <p className="text-xs mt-1 opacity-50">
          {new Date(err.timestamp).toLocaleTimeString("pt-BR")}
        </p>
      </div>

      <button
        onClick={onDismiss}
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity mt-0.5"
        aria-label="Fechar"
      >
        <X size={15} />
      </button>
    </div>
  );
}

/**
 * GlobalErrorToast — renderiza no canto superior direito do sistema.
 * Erros NÃO fecham automaticamente (o usuário precisa confirmar que viu).
 * Adicione este componente dentro do DashboardShell.
 */
export default function GlobalErrorToast() {
  const { errors, dismiss, dismissAll } = useErrorStore();

  // Capturar erros de promises não tratadas (unhandledrejection)
  useEffect(() => {
    function handler(e: PromiseRejectionEvent) {
      e.preventDefault();
      const msg =
        e.reason instanceof Error
          ? e.reason.message
          : typeof e.reason === "string"
          ? e.reason
          : "Erro inesperado — tente novamente.";

      useErrorStore.getState().push(msg, { level: "critical" });
    }
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  // Capturar erros JS globais (window.onerror)
  useEffect(() => {
    function handler(event: ErrorEvent) {
      // Ignorar erros de extensões/third-party
      if (event.filename && !event.filename.includes(window.location.origin)) return;

      // Ignorar ruído conhecido do profiler interno de React 19 / Next 16.
      // Em dev mode, Next às vezes chama performance.measure com delta negativo
      // durante hot reload ou re-render durante hidratação. Não afeta runtime.
      const msg = event.message ?? "";
      if (
        msg.includes("cannot have a negative time stamp") ||
        msg.includes("performance.measure") ||
        msg.includes("Performance.measure") ||
        msg.includes("Failed to execute 'measure' on 'Performance'")
      ) {
        return;
      }

      useErrorStore.getState().push(
        "Erro inesperado na aplicação",
        { level: "critical", detail: event.message },
      );
    }
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  if (errors.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="assertive"
    >
      {errors.length > 1 && (
        <div className="flex justify-end pointer-events-auto">
          <button
            onClick={dismissAll}
            className="text-xs text-white bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded-full flex items-center gap-1 shadow"
          >
            <AlertCircle size={11} />
            Fechar todos ({errors.length})
          </button>
        </div>
      )}

      {errors.map((err) => (
        <ErrorCard
          key={err.id}
          err={err}
          onDismiss={() => dismiss(err.id)}
        />
      ))}
    </div>
  );
}
