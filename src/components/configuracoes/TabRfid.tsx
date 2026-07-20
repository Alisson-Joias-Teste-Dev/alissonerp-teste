"use client";

import { PainelLayoutEtiqueta } from "@/components/rfid/PainelLayoutEtiqueta";

export default function TabRfid() {
  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Etiquetas RFID</h2>
        <p className="text-xs mt-0.5 text-gray-500">
          Calibre a impressora e salve o modelo de etiqueta padrão.
        </p>
      </div>
      <PainelLayoutEtiqueta />
    </div>
  );
}
