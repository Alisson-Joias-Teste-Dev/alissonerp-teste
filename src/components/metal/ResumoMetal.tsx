"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-019: ResumoMetal — Cards com totais pendentes de compras e recebimentos
//
// REGRA DE NEGÓCIO: Mostra apenas gramas pendentes de baixa para os dois
// fluxos de entrada de metal:
//   - Compras pendentes: status = pendente_pagamento ou pendente_aprovacao
//   - Recebimentos pendentes: status = pendente
// O card de Cofre foi removido conforme solicitação do usuário.
//
// IMPACTO SE ALTERADO: Usuário perde visibilidade rápida do que está pendente
// no módulo metal. Não afeta cálculos de registro ou banco de dados.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { ShoppingBag, ArrowRightLeft } from "lucide-react";

interface Resumo {
  compras_gramas_pendentes: number;
  recebimentos_gramas_pendentes: number;
}

// REGRA DE NEGÓCIO: Soma campo numérico de um array de registros.
// Usada para agregar peso_gramas dos registros filtrados por status pendente.
function somaCampo(arr: Record<string, unknown>[] | undefined, campo: string): number {
  if (!arr || !arr.length) return 0;
  return arr.reduce((s, r) => s + (Number(r[campo]) || 0), 0);
}

export default function ResumoMetal() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const [compras, receb] = await Promise.all([
          fetch("/api/metal/compras?limit=100").then((r) => r.json()),
          fetch("/api/metal/recebimentos?limit=100").then((r) => r.json()),
        ]);

        // REGRA DE NEGÓCIO: Filtra apenas compras ainda não pagas
        // (pendente_pagamento) ou aguardando aprovação (pendente_aprovacao).
        const comprasPendentes = (compras?.data ?? []).filter(
          (r: Record<string, unknown>) =>
            r.status === "pendente_pagamento" || r.status === "pendente_aprovacao"
        );

        // REGRA DE NEGÓCIO: Filtra apenas recebimentos com status pendente.
        // Conforme definido pelo usuário, "pendente" = aguardando baixa.
        const recebPendentes = (receb?.data ?? []).filter(
          (r: Record<string, unknown>) => r.status === "pendente"
        );

        setResumo({
          compras_gramas_pendentes: somaCampo(comprasPendentes, "peso_gramas"),
          recebimentos_gramas_pendentes: somaCampo(recebPendentes, "peso_gramas"),
        });
      } catch {
        // fallback silencioso
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Card Compras Pendentes */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-10">
          <ShoppingBag size={48} />
        </div>
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">
            Compras Pendentes de Baixa
          </p>
          <p className="text-xl font-bold text-[#C59B6D] mt-1">
            {(resumo?.compras_gramas_pendentes ?? 0).toFixed(1)}g
          </p>
          <p className="text-[11px] opacity-70 mt-1">
            Aguardando pagamento ou aprovação
          </p>
        </div>
      </div>

      {/* Card Recebimentos Pendentes */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-4 shadow-lg relative overflow-hidden">
        <div className="absolute top-2 right-2 opacity-10">
          <ArrowRightLeft size={48} />
        </div>
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">
            Recebimentos Pendentes de Baixa
          </p>
          <p className="text-xl font-bold text-[#C59B6D] mt-1">
            {(resumo?.recebimentos_gramas_pendentes ?? 0).toFixed(1)}g
          </p>
          <p className="text-[11px] opacity-70 mt-1">
            Aguardando processamento
          </p>
        </div>
      </div>
    </div>
  );
}
