import { create } from "zustand";
import type { ZebraDevice } from "@/lib/rfid/browser-print";

/**
 * Status da conexão com o Zebra Browser Print no PC local.
 *
 * Estados:
 *   - "buscando" : procurando dispositivo (default inicial)
 *   - "conectado" : impressora encontrada e pronta
 *   - "ausente"   : Browser Print não instalado ou nenhuma impressora
 *   - "erro"      : falha de comunicação com o dispositivo
 */
export type ConexaoStatus = "buscando" | "conectado" | "ausente" | "erro";

interface RfidStore {
  device: ZebraDevice | null;
  status: ConexaoStatus;
  setDevice: (device: ZebraDevice | null) => void;
  setStatus: (status: ConexaoStatus) => void;
  reset: () => void;
}

export const useRfidStore = create<RfidStore>((set) => ({
  device: null,
  status: "buscando",

  setDevice(device) {
    set({ device });
  },

  setStatus(status) {
    set({ status });
  },

  reset() {
    set({ device: null, status: "buscando" });
  },
}));
