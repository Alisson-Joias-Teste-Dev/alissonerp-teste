"use client";

import { useRef, useEffect, useState } from "react";
import { Tag, Package } from "lucide-react";
import QRCode from "qrcode";

interface PreviewEtiquetaProps {
  epc: string | null;
  sku: string;
  nome: string;
}

/**
 * Preview visual do layout da etiqueta RFID.
 *
 * Exibe um QR code do EPC e as informações do produto no formato
 * que será impresso pela ZD500R.
 */
export function PreviewEtiqueta({ epc, sku, nome }: PreviewEtiquetaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    if (!epc || !canvasRef.current) {
      setQrError(false);
      return;
    }

    let cancelled = false;

    QRCode.toCanvas(canvasRef.current, epc, {
      width: 120,
      margin: 2,
      color: {
        dark: "#184036",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
    })
      .then(() => {
        if (!cancelled) setQrError(false);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [epc]);

  // Empty state
  if (!epc) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 py-8">
        <Tag size={28} className="text-gray-300" />
        <p className="text-sm text-gray-400">
          Selecione um produto e imprima para gerar o preview
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <h4 className="mb-4 text-sm font-semibold text-gray-800">
        Preview da Etiqueta
      </h4>

      {/* Label preview card */}
      <div className="mx-auto flex max-w-xs flex-col items-center gap-4 rounded-xl border border-gray-300 bg-white p-5 shadow-sm">
        {/* QR Code */}
        <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-white">
          {qrError ? (
            <Package size={40} className="text-gray-300" />
          ) : (
            <canvas ref={canvasRef} className="h-32 w-32" />
          )}
        </div>

        {/* Info */}
        <div className="w-full space-y-1 text-center">
          {/* SKU */}
          <p className="font-mono text-lg font-bold text-emerald-700">
            {sku || "—"}
          </p>

          {/* Nome */}
          <p className="line-clamp-2 text-sm text-gray-700">
            {nome || "Produto sem nome"}
          </p>
        </div>

        {/* EPC footer */}
        <div className="w-full rounded-lg bg-gray-50 px-3 py-2 text-center">
          <p className="text-xs text-gray-500">EPC</p>
          <p className="font-mono text-xs font-semibold text-gray-700 break-all">
            {epc}
          </p>
        </div>
      </div>

      {/* Legend */}
      <p className="mt-3 text-center text-xs text-gray-400">
        Layout aproximado — a impressão real na ZD500R pode variar conforme
        o template ZPL.
      </p>
    </div>
  );
}
