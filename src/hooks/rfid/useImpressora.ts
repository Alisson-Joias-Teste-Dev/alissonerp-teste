"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRfidStore, type ConexaoStatus } from "@/stores/rfidStore";
import {
  listarImpressoras,
  impressoraPadrao,
  BrowserPrintNaoInstaladoError,
  type ZebraDevice,
} from "@/lib/rfid/browser-print";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface UseImpressoraReturn {
  /** Dispositivo Zebra atualmente selecionado (ou null). */
  device: ZebraDevice | null;

  /** Status da conexão: "buscando" | "conectado" | "ausente" | "erro". */
  status: ConexaoStatus;

  /** Força redescoberta da impressora (invalida cache e refetch). */
  reconectar: () => void;
}

// ---------------------------------------------------------------------------
// Query function
// ---------------------------------------------------------------------------

async function buscarImpressora(): Promise<ZebraDevice | null> {
  try {
    // 1 — Tenta impressora padrão configurada no Browser Print
    const padrao = await impressoraPadrao();
    if (padrao) return padrao;

    // 2 — Se não tem padrão, pega a primeira da lista
    const lista = await listarImpressoras();
    return lista.length > 0 ? lista[0] : null;
  } catch (err) {
    if (err instanceof BrowserPrintNaoInstaladoError) {
      throw err; // Propaga para query.error
    }
    // Outros erros de dispositivo: retorna null (status="ausente")
    console.warn("[useImpressora] Erro ao buscar impressora:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook de descoberta e monitoramento da impressora Zebra via Browser Print.
 *
 * Faz polling a cada 10 segundos para detectar conexão/desconexão da
 * impressora no PC local. Sincroniza com store global via useRfidStore.
 *
 * Uso típico:
 *   const { device, status, reconectar } = useImpressora();
 *   if (status === "conectado") { ... }
 */
export function useImpressora(): UseImpressoraReturn {
  const queryClient = useQueryClient();
  const storeDevice = useRfidStore((s) => s.device);
  const storeStatus = useRfidStore((s) => s.status);
  const setDevice = useRfidStore((s) => s.setDevice);
  const setStatus = useRfidStore((s) => s.setStatus);

  const query = useQuery<ZebraDevice | null>({
    queryKey: ["rfid", "impressora"],
    queryFn: buscarImpressora,
    refetchInterval: 10_000, // 10s
    staleTime: 5_000,
    retry: false,
  });

  // Sincroniza resultado da query → store via useEffect
  useEffect(() => {
    if (query.data !== undefined) {
      if (query.data && query.data !== storeDevice) {
        setDevice(query.data);
        setStatus("conectado");
      } else if (!query.data && storeStatus !== "ausente") {
        setDevice(null);
        setStatus("ausente");
      }
    }
  }, [query.data, storeDevice, storeStatus, setDevice, setStatus]);

  // Sincroniza erro da query → store via useEffect
  useEffect(() => {
    if (query.error) {
      if (query.error instanceof BrowserPrintNaoInstaladoError) {
        if (storeStatus !== "ausente") {
          setStatus("ausente");
          setDevice(null);
        }
      } else if (storeStatus !== "erro") {
        setStatus("erro");
      }
    }
  }, [query.error, storeStatus, setStatus, setDevice]);

  function reconectar() {
    setStatus("buscando");
    queryClient.invalidateQueries({ queryKey: ["rfid", "impressora"] });
  }

  return {
    device: storeDevice,
    status: storeStatus,
    reconectar,
  };
}
