"use client";

import { Printer, RefreshCw } from "lucide-react";

import { useImprimirEtiqueta } from "@/hooks/rfid/useImprimirEtiqueta";
import { BotaoImprimir } from "@/components/rfid/BotaoImprimir";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface BotaoImprimirEtiquetaProps {
  produtoId: number;
  className?: string;
  variant?: "full" | "compact";
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Botão reutilizável de "imprimir etiqueta RFID" para qualquer tela
 * (drawer de produtos, linha de tabela de estoque, configurações etc.).
 *
 * - variant="full": botão grande com overlay de progresso (mesmo visual do
 *   módulo de cadastro), via <BotaoImprimir>.
 * - variant="compact": botão pequeno com ícone, para caber em headers de
 *   drawer ou linhas de tabela.
 *
 * Quando a impressora não está conectada, o botão fica desabilitado com
 * tooltip explicativo e, na variante compact, um atalho para reconectar.
 */
export function BotaoImprimirEtiqueta({
  produtoId,
  className,
  variant = "full",
}: BotaoImprimirEtiquetaProps) {
  const { imprimir, imprimindo, conectado, reconectar } = useImprimirEtiqueta();

  const handleClick = () => {
    if (!conectado || imprimindo) return;
    imprimir(produtoId);
  };

  if (variant === "full") {
    return (
      <div className={className}>
        <BotaoImprimir onClick={handleClick} disabled={!conectado} imprimindo={imprimindo} />
      </div>
    );
  }

  // ── variant="compact" ────────────────────────────────────────────────
  const titulo = conectado
    ? "Imprimir etiqueta RFID"
    : "Impressora não conectada — abra o Zebra Browser Print";

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={!conectado || imprimindo}
        title={titulo}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
          !conectado || imprimindo
            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
            : "cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        }`}
      >
        <Printer size={14} className={imprimindo ? "animate-pulse" : undefined} />
        {imprimindo ? "Imprimindo..." : "Etiqueta"}
      </button>

      {!conectado && (
        <button
          type="button"
          onClick={reconectar}
          title="Tentar reconectar impressora"
          className="cursor-pointer text-gray-400 transition hover:text-emerald-700"
        >
          <RefreshCw size={12} />
        </button>
      )}
    </span>
  );
}
