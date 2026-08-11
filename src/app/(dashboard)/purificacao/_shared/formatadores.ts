/**
 * Formatação e rótulos de status compartilhados entre Purificação e Ligação.
 * Extraído na Etapa 5 do plano de consolidação — eram cópias byte-a-byte.
 * NÃO confundir com src/lib/formatters.ts::formatPeso — aquele devolve o
 * número sem "g" e a data sem hora; aqui o formato inclui "g" e hora/minuto,
 * que é o que as duas telas sempre mostraram (extração pura, sem mudar saída).
 */
export function formatPeso(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return isNaN(v) ? "—" : v.toFixed(2) + "g";
}

export function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatTeor(t: number): string {
  return (t * 100).toFixed(2) + "%";
}

export function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

export const STATUS_LABEL: Record<string, string> = {
  em_processo: "Em Processo",
  concluida:   "Concluída",
  cancelada:   "Cancelada",
};

export const STATUS_COLOR: Record<string, string> = {
  em_processo: "#d97706",
  concluida:   "#16a34a",
  cancelada:   "#6b7280",
};

/** Quem pode cancelar uma purificação/ligação em processo. */
export const ROLES_CANCELAR = ["admin", "desenvolvedor"];
