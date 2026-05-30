"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-019: StatusPagamento — Badge de status visual
//
// REGRA DE NEGÓCIO: Status reflete o ciclo de vida
//   ✅ Confirmado = pagamento aprovado, metal no cofre
//   ⏳ Pendente = aguardando pagamento MP
//   ❌ Cancelado = compra cancelada
// ═══════════════════════════════════════════════════════════════════════════

interface StatusPagamentoProps {
  status: string;
  /** "compra" ou "recebimento" */
  tipo?: "compra" | "recebimento";
}

const variants: Record<string, { bg: string; text: string; label: string }> = {
  confirmado:  { bg: "bg-emerald-100", text: "text-emerald-700", label: "Confirmado" },
  aprovado:    { bg: "bg-emerald-100", text: "text-emerald-700", label: "Confirmado" },
  ativo:       { bg: "bg-emerald-100", text: "text-emerald-700", label: "Ativo" },
  pendente_pagamento: { bg: "bg-amber-100", text: "text-amber-700", label: "⏳ Pendente" },
  pendente:    { bg: "bg-amber-100", text: "text-amber-700", label: "⏳ Pendente" },
  cancelado:   { bg: "bg-red-100", text: "text-red-700", label: "❌ Cancelado" },
  rejeitado:   { bg: "bg-red-100", text: "text-red-700", label: "❌ Rejeitado" },
};

export default function StatusPagamento({ status, tipo = "compra" }: StatusPagamentoProps) {
  const v = variants[status] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
    label: status,
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${v.bg} ${v.text}`}>
      {v.label}
    </span>
  );
}
