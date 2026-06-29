export const TIPO_CORES: Record<string, string> = {
  pix: "#16a34a",
  cartao: "#2563eb",
  dinheiro: "#059669",
  ouro: "#d97706",
  outro: "#6b7280",
};

export const TIPO_LABELS: Record<string, string> = {
  pix: "PIX",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  ouro: "Ouro",
  outro: "Outro (múltiplos)",
};

export const PROVEDORES = [
  { id: "claude", nome: "Claude", empresa: "Anthropic", prefixo: "sk-ant-" },
  { id: "openai", nome: "GPT-4o", empresa: "OpenAI", prefixo: "sk-" },
  { id: "gemini", nome: "Gemini", empresa: "Google", prefixo: "AIza" },
] as const;

export const ROLE_LABEL: Record<string, string> = {
  desenvolvedor: "Desenvolvedor",
  admin: "Admin",
  gerente_fabrica: "Gerente Fábrica",
  gerente_loja: "Gerente Loja",
  ourives: "Ourives",
  motoboy: "Motoboy",
  consultora: "Consultora",
  estoquista_fabrica: "Estoquista Fábrica",
  estoquista_loja: "Estoquista Loja",
  pcp: "PCP",
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
