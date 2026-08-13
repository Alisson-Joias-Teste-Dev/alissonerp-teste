"use client";

interface Props {
  status: string;
}

const STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  autorizada:  { bg: "#ECFDF5", color: "#065F46", label: "Autorizada"       },
  processando: { bg: "#FFFBEB", color: "#92400E", label: "Aguardando SEFAZ" },
  rejeitada:   { bg: "#FEF2F2", color: "#991B1B", label: "Rejeitada"        },
  cancelada:   { bg: "#F3F4F6", color: "#374151", label: "Cancelada"        },
  denegada:    { bg: "#FFF7ED", color: "#9A3412", label: "Denegada"         },
  rascunho:    { bg: "#F5F5F4", color: "#78716C", label: "Rascunho"         },
};

export default function NotaFiscalStatusBadge({ status }: Props) {
  const cfg = STATUS_MAP[status] ?? { bg: "#F5F5F4", color: "#78716C", label: status };
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}
