// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: /metal/page.tsx — Página principal do módulo Metal
//
// REGRA DE NEGÓCIO: Dashboard do módulo metal. Mostra cards de resumo
// e ações rápidas para nova compra ou recebimento.
// ═══════════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { ShoppingBag, ArrowRightLeft } from "lucide-react";
import ResumoMetal from "@/components/metal/ResumoMetal";

export default function MetalPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-[fadeIn_0.3s_ease-out]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A3C34]">Metal</h1>
        <p className="text-sm text-[#1A3C34]/60 mt-1">
          Gerencie a entrada de metal no sistema
        </p>
      </div>

      {/* Resumo */}
      <ResumoMetal />

      {/* Ações rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/metal/comprar"
          className="bg-white border-2 border-[#1A3C34] rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-[#1A3C34] p-3 rounded-xl group-hover:scale-110 transition-transform">
              <ShoppingBag size={24} className="text-[#C59B6D]" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-[#1A3C34]">Nova Compra</h2>
              <p className="text-xs text-[#1A3C34]/60">
                Comprar metal de fornecedor. Pagamento via Mercado Pago.
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/metal/receber"
          className="bg-white border-2 border-[#C59B6D] rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="bg-[#C59B6D] p-3 rounded-xl group-hover:scale-110 transition-transform">
              <ArrowRightLeft size={24} className="text-[#1A3C34]" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-[#1A3C34]">Novo Recebimento</h2>
              <p className="text-xs text-[#1A3C34]/60">
                Receber metal de cliente como pagamento. Gera crédito na venda.
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* Link histórico */}
      <div className="text-center">
        <Link
          href="/metal/historico"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#1A3C34]/60 hover:text-[#1A3C34] transition-colors"
        >
          Ver histórico completo →
        </Link>
      </div>
    </div>
  );
}
