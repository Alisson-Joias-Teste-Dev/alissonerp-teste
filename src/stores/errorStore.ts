import { create } from "zustand";

export interface GlobalError {
  id: string;
  message: string;
  detail?: string;
  timestamp: number;
  /** "critical" → vermelho forte, "warning" → laranja, "info" → cinza */
  level: "critical" | "warning" | "info" | "success";
}

interface ErrorStore {
  errors: GlobalError[];
  push: (message: string, options?: { detail?: string; level?: GlobalError["level"] }) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export const useErrorStore = create<ErrorStore>((set) => ({
  errors: [],

  push(message, options = {}) {
    const entry: GlobalError = {
      id:        `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      message,
      detail:    options.detail,
      level:     options.level ?? "critical",
      timestamp: Date.now(),
    };
    set((s) => ({ errors: [...s.errors, entry] }));
  },

  dismiss(id) {
    set((s) => ({ errors: s.errors.filter((e) => e.id !== id) }));
  },

  dismissAll() {
    set({ errors: [] });
  },
}));

/** Hook de atalho — use em qualquer componente */
export function useGlobalError() {
  const push = useErrorStore((s) => s.push);
  return {
    pushError:   (msg: string, detail?: string) => push(msg, { level: "critical", detail }),
    pushWarning: (msg: string, detail?: string) => push(msg, { level: "warning",  detail }),
    pushInfo:    (msg: string, detail?: string) => push(msg, { level: "info",     detail }),
  };
}
