"use client";

import { Loader2, PrinterCheck, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import type { ConexaoStatus } from "@/stores/rfidStore";
import type { ZebraDevice } from "@/lib/rfid/browser-print";

interface BannerImpressoraProps {
  status: ConexaoStatus;
  device: ZebraDevice | null;
  onReconectar: () => void;
}

/**
 * Banner que exibe o status de conexão com a impressora Zebra ZD500R
 * via Browser Print no PC local.
 */
export function BannerImpressora({ status, device, onReconectar }: BannerImpressoraProps) {
  switch (status) {
    case "buscando":
      return (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800">Procurando impressora...</p>
            <p className="mt-0.5 text-sm text-amber-700">
              Detectando impressora ZD500R via Zebra Browser Print.
            </p>
          </div>
        </div>
      );

    case "conectado":
      return (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <PrinterCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-emerald-800">Impressora conectada</p>
            {device && (
              <p className="mt-0.5 text-sm text-emerald-700">
                {device.name}
                <span className="ml-1 text-xs text-emerald-500">({device.connection})</span>
              </p>
            )}
          </div>
        </div>
      );

    case "ausente":
      return (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-sm font-semibold text-red-800">
                Nenhuma impressora ZD500R encontrada
              </p>
              <p className="mt-0.5 text-sm text-red-700">
                O Zebra Browser Print precisa estar instalado e rodando neste computador.
              </p>
            </div>
            <a
              href="https://www.zebra.com/us/en/support-downloads/printer-software/printer-setup-utilities/browser-print.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-red-700 underline hover:text-red-900"
            >
              Instalar Zebra Browser Print
              <ExternalLink size={12} />
            </a>
            <div>
              <button
                type="button"
                onClick={onReconectar}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors"
              >
                <RefreshCw size={14} />
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );

    case "erro":
      return (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">Erro de comunicação</p>
            <p className="mt-0.5 text-sm text-red-700">
              Falha ao comunicar com a impressora ZD500R. Verifique se o Zebra Browser
              Print está rodando e tente reconectar.
            </p>
          </div>
        </div>
      );

    default:
      return null;
  }
}
