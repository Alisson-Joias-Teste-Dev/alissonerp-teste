"use client";

import { Printer, Loader2 } from "lucide-react";

interface BotaoImprimirProps {
  onClick: () => void;
  disabled: boolean;
  imprimindo: boolean;
}

/**
 * Botão principal de impressão de etiqueta RFID na ZD500R.
 *
 * Exibe overlay modal durante a impressão (não feche a página)
 * e badge de atalho "Ctrl+P" no estado normal.
 */
export function BotaoImprimir({ onClick, disabled, imprimindo }: BotaoImprimirProps) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || imprimindo}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold text-white transition ${
          disabled || imprimindo
            ? "cursor-not-allowed bg-gray-400 opacity-40"
            : "cursor-pointer bg-emerald-800 hover:bg-emerald-700 active:bg-emerald-900"
        }`}
      >
        {imprimindo ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Imprimindo...
          </>
        ) : (
          <>
            <Printer size={18} />
            Gerar EPC e Imprimir
            <span className="ml-2 rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-normal">
              Ctrl+P
            </span>
          </>
        )}
      </button>

      {/* Overlay — bloqueia interação durante a impressão */}
      {imprimindo && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex w-80 flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <Loader2 size={32} className="animate-spin text-emerald-600" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">
                Gravando etiqueta...
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Enviando dados para a ZD500R via Browser Print.
                <br />
                Não feche esta página.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
