"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-022: MetalPageClient — Página principal do módulo Metal
//
// REGRA DE NEGÓCIO: Substitui o dashboard antigo. Ao acessar /metal, o
// usuário já vê o formulário de Nova Compra por padrão. Botões de alternância
// permitem trocar para Novo Recebimento na mesma tela. Cards de resumo no topo
// mostram apenas gramas pendentes de baixa (compras + recebimentos).
//
// IMPACTO SE ALTERADO: Usuário perde acesso rápido aos formulários de metal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRightLeft, History } from "lucide-react";
import ResumoMetal from "@/components/metal/ResumoMetal";
import CompraForm from "@/components/metal/CompraForm";
import RecebimentoForm from "@/components/metal/RecebimentoForm";
import type { MetalConfig } from "@/lib/metal/types";

interface MetalPageClientProps {
  cotacaoOuro: number;
  configs: MetalConfig;
}

type Aba = "compra" | "recebimento";

export default function MetalPageClient({ cotacaoOuro, configs }: MetalPageClientProps) {
  const [aba, setAba] = useState<Aba>("compra");

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Breadcrumb */}
      <div className="text-xs text-[#1A3C34]/50 font-bold uppercase tracking-wide">
        <span className="text-[#1A3C34]/30">Home</span>
        <span className="mx-1">›</span>
        <span className="text-[#1A3C34]/60">Metal</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1A3C34]">Metal</h1>
        <p className="text-sm text-[#1A3C34]/60 mt-1">
          Gerencie a entrada de metal no sistema
        </p>
      </div>

      {/* Resumo — 2 cards (sem cofre) */}
      <ResumoMetal />

      {/* Abas de operação */}
      <div className="flex gap-3">
        <button
          onClick={() => setAba("compra")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            aba === "compra"
              ? "bg-[#1A3C34] text-[#C59B6D] shadow-lg"
              : "bg-white border-2 border-[#1A3C34]/20 text-[#1A3C34]/60 hover:border-[#1A3C34] hover:text-[#1A3C34]"
          }`}
        >
          <ShoppingBag size={16} />
          Nova Compra
        </button>
        <button
          onClick={() => setAba("recebimento")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            aba === "recebimento"
              ? "bg-[#C59B6D] text-[#1A3C34] shadow-lg"
              : "bg-white border-2 border-[#C59B6D]/30 text-[#1A3C34]/60 hover:border-[#C59B6D] hover:text-[#1A3C34]"
          }`}
        >
          <ArrowRightLeft size={16} />
          Novo Recebimento
        </button>
        <Link
          href="/metal/historico"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all bg-white border-2 border-[#1A3C34]/20 text-[#1A3C34]/60 hover:border-[#1A3C34] hover:text-[#1A3C34]"
        >
          <History size={16} />
          Histórico
        </Link>
      </div>

      {/* Formulário com largura responsiva — confortável no notebook e no celular */}
      <div className="max-w-4xl">
        {aba === "compra" ? (
          <CompraForm cotacaoOuro={cotacaoOuro} configs={configs} />
        ) : (
          <RecebimentoForm cotacaoOuro={cotacaoOuro} configs={configs} />
        )}
      </div>
    </div>
  );
}
