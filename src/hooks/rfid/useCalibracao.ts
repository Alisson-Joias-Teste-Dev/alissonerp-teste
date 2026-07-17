"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  enviarComando,
  type ZebraDevice,
} from "@/lib/rfid/browser-print";
import {
  interpretarRespostaCalibracao,
} from "@/lib/rfid/verificacao";
import { gerarZplCalibracao } from "@/lib/rfid/zpl";
import type { ResultadoCalibracao } from "@/lib/rfid/tipos";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface UseCalibracaoReturn {
  /**
   * Inicia o processo de calibração RFID na impressora.
   *
   * Envia `^HR` via Browser Print e aguarda a resposta da impressora
   * (pode durar até ~5 minutos). O resultado é interpretado por
   * `interpretarRespostaCalibracao`.
   *
   * @param device Dispositivo Zebra (obtido de useImpressora).
   * @returns Resultado da calibração (posição, antena, potências, TID, sucesso).
   */
  calibrar: (device: ZebraDevice) => Promise<ResultadoCalibracao>;

  /** Resultado da última calibração (ou null se nunca calibrou). */
  resultado: ResultadoCalibracao | null;

  /** `true` enquanto a calibração está em andamento (pode durar minutos). */
  isCalibrating: boolean;

  /** Erro ocorrido durante a calibração (ou null). */
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Mutation function
// ---------------------------------------------------------------------------

async function executarCalibracao(
  device: ZebraDevice,
): Promise<ResultadoCalibracao> {
  // Gera ZPL de calibração (^XA ^HR ^XZ)
  const zpl = gerarZplCalibracao();

  // Envia comando e aguarda resposta (timeout de 5 min via enviarComando)
  const raw = await enviarComando(device, zpl);

  // Interpreta a tabela de calibração retornada
  return interpretarRespostaCalibracao(raw);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook de calibração de tag RFID.
 *
 * Dispara o comando `^HR` na impressora Zebra, que realiza a calibração
 * automática de posição de programação e potências read/write.
 *
 * Duração: até ~5 minutos (a impressora move a mídia 1 mm por vez).
 *
 * Uso típico:
 *   const { calibrar, resultado, isCalibrating, error } = useCalibracao();
 *
 *   const res = await calibrar(device);
 *   if (res.sucesso) {
 *     console.log("Posição:", res.posicao, "Antena:", res.antena);
 *   }
 */
export function useCalibracao(): UseCalibracaoReturn {
  const [resultado, setResultado] = useState<ResultadoCalibracao | null>(null);

  const mutation = useMutation({
    mutationFn: (device: ZebraDevice) => executarCalibracao(device),
    onSuccess: (data) => {
      setResultado(data);
    },
  });

  return {
    calibrar: mutation.mutateAsync,
    resultado,
    isCalibrating: mutation.isPending,
    error: mutation.error,
  };
}
