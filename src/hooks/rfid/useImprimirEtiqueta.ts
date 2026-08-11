"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useImpressora } from "@/hooks/rfid/useImpressora";
import { usePrintFlow } from "@/hooks/rfid/usePrintFlow";
import type { ConexaoStatus } from "@/stores/rfidStore";
import type { ZebraDevice } from "@/lib/rfid/browser-print";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface UseImprimirEtiquetaReturn {
  /** Executa o ciclo completo cadastrar → enviar → confirmar/reverter, com toasts. */
  imprimir: (produtoId: number) => Promise<void>;

  /** true enquanto o fluxo de impressão está em andamento (fase !== "idle"). */
  imprimindo: boolean;

  /** true quando há impressora conectada e pronta para uso. */
  conectado: boolean;

  // Repassados de useImpressora
  status: ConexaoStatus;
  device: ZebraDevice | null;
  reconectar: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Encapsula o núcleo reutilizável de "imprimir etiqueta RFID": descoberta de
 * impressora (useImpressora) + máquina de estados de impressão (usePrintFlow)
 * + o ciclo cadastrar→enviar→confirmar/reverter, com toasts e invalidação da
 * sessão RFID — o mesmo fluxo hoje implementado em
 * `src/app/(dashboard)/rfid/cadastro/CadastroRfidClient.tsx` (handleImprimir).
 *
 * Uso típico:
 *   const { imprimir, imprimindo, conectado, device, status, reconectar } = useImprimirEtiqueta();
 *   <BotaoImprimirEtiqueta produtoId={produto.id_produto} />
 */
export function useImprimirEtiqueta(): UseImprimirEtiquetaReturn {
  const queryClient = useQueryClient();
  const { device, status, reconectar } = useImpressora();
  const { state: printState, actions: printActions } = usePrintFlow();

  const conectado = status === "conectado" && device !== null;
  const imprimindo = printState.phase !== "idle";

  const imprimir = useCallback(
    async (produtoId: number) => {
      if (!conectado || !device) {
        toast.error("Impressora não conectada", {
          description: "Verifique o Zebra Browser Print.",
        });
        return;
      }

      try {
        // 1. Cadastrar EPC no backend
        const { epc, zpl } = await printActions.cadastrar(produtoId);

        // 2. Enviar para impressora + verificar
        const resultado = await printActions.enviar(device, zpl);

        // 3. Reagir ao resultado
        switch (resultado.status) {
          case "ok":
            await printActions.confirmar(epc);
            toast.success("Tag gravada e conferida");
            queryClient.invalidateQueries({ queryKey: ["rfid", "sessao"] });
            break;

          case "void":
            await printActions.reverter(epc, resultado.mensagem);
            toast.error("Etiqueta saiu VOID", {
              description: resultado.mensagem,
            });
            break;

          case "no_tag":
            await printActions.reverter(epc, resultado.mensagem);
            toast.error("Nenhuma etiqueta detectada", {
              description: resultado.mensagem,
            });
            break;

          case "divergente":
            await printActions.reverter(epc, resultado.mensagem);
            toast.error("Divergência de EPC", {
              description: resultado.mensagem,
            });
            break;

          case "offline":
            await printActions.reverter(epc, resultado.mensagem);
            toast("Impressora não respondeu", {
              description: resultado.mensagem,
            });
            break;
        }
      } catch (err: unknown) {
        const mensagem =
          err && typeof err === "object" && "message" in err
            ? (err as { message: string }).message
            : "Erro inesperado";

        toast.error("Falha na impressão", {
          description: mensagem,
        });
        printActions.reset();
      }
    },
    [conectado, device, printActions, queryClient],
  );

  return { imprimir, imprimindo, conectado, status, device, reconectar };
}
