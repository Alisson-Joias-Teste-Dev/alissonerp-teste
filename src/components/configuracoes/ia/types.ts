"use client";

// ─── Tipos compartilhados entre componentes de IA ───────────────────────────

export interface ConfigIA {
  ia_ativa: string;
  ia_provedor: string;
  ia_modelo_claude: string;
  ia_modelo_openai: string;
  ia_modelo_gemini: string;
  ia_margem_pedra_pct?: string;
}

export interface KeysStatus {
  claude: boolean;
  openai: boolean;
  gemini: boolean;
}

export interface ResultadoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
  provedor: string;
}

export const PROVEDORES = [
  { id: "claude",  nome: "Claude",  empresa: "Anthropic", prefixo: "sk-ant-" },
  { id: "openai",  nome: "GPT-4o",  empresa: "OpenAI",    prefixo: "sk-"     },
  { id: "gemini",  nome: "Gemini",  empresa: "Google",    prefixo: "AIza"    },
] as const;

// ─── Paleta (tema claro — alinhado com aba Usuários) ─────────────────────────
export const P = {
  bg:       "#f9fafb",  // gray-50
  card:     "#ffffff",  // white
  border:   "#e5e7eb",  // gray-200
  creme:    "#111827",  // gray-900 — texto principal
  sage:     "#6b7280",  // gray-500 — texto secundário
  muted:    "#9ca3af",  // gray-400 — texto mutado
  dourado:  "#d97706",  // amber-600
  verde:    "#16a34a",  // green-600
  vermelho: "#dc2626",  // red-600
} as const;
