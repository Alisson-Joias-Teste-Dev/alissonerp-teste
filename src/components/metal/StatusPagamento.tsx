"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-019: StatusPagamento — Badge de status visual
//
// REGRA DE NEGÓCIO: Status reflete o ciclo de vida
//   ✅ Confirmado = pagamento aprovado, metal no cofre
//   ⏳ Pendente Pagamento = aguardando pagamento MP
//   🔒 Pendente Aprovação = acima do teto, aguardando aprovação
//   ❌ Cancelado = compra cancelada
// ═══════════════════════════════════════════════════════════════════════════

import { Clock, XCircle } from "lucide-react";

interface StatusPagamentoProps {
  status: string;
  /** "compra" ou "recebimento" */
  tipo?: "compra" | "recebimento";
}

const variants: Record<string, { bg: string; text: string; label: string; icon?: React.ReactNode }> = {
  confirmado:  { bg: "bg-emerald-100", text: "text-emerald-700", label: "Confirmado" },
  aprovado:    { bg: "bg-sky-100",     text: "text-sky-700",     label: "Aprovado" },
  ativo:       { bg: "bg-emerald-100", text: "text-emerald-700", label: "Ativo" },
  // REGRA DE NEGÓCIO: pendente_aprovacao é diferente de pendente_pagamento —
  // indica compra acima do teto aguardando decisão do aprovador configurado.
  pendente_aprovacao: { bg: "bg-purple-100", text: "text-purple-700", label: "Pend. Aprovação", icon: <Clock size={10} strokeWidth={2.5} /> },
  pendente_pagamento: { bg: "bg-amber-100",  text: "text-amber-700",  label: "Pendente",         icon: <Clock size={10} strokeWidth={2.5} /> },
  pendente:    { bg: "bg-amber-100",  text: "text-amber-700",  label: "Pendente",         icon: <Clock size={10} strokeWidth={2.5} /> },
  cancelado:   { bg: "bg-red-100",    text: "text-red-700",    label: "Cancelado",        icon: <XCircle size={10} strokeWidth={2.5} /> },
  rejeitado:   { bg: "bg-red-100",    text: "text-red-700",    label: "Rejeitado",        icon: <XCircle size={10} strokeWidth={2.5} /> },
};

export default function StatusPagamento({ status, tipo = "compra" }: StatusPagamentoProps) {
  const v = variants[status] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: status,
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${v.bg} ${v.text}`}>
      {v.icon}
      {v.label}
    </span>
  );
}
