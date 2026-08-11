"use client";

import { useReducer, useCallback, useRef } from "react";
import {
  enviarEVerificar,
  type ZebraDevice,
} from "@/lib/rfid/browser-print";
import {
  interpretarRespostaGravacao,
} from "@/lib/rfid/verificacao";
import type { Epc, ResultadoGravacao } from "@/lib/rfid/tipos";

// ---------------------------------------------------------------------------
// State Machine Types
// ---------------------------------------------------------------------------

export type PrintState =
  | { phase: "idle" }
  | { phase: "cadastrando" }
  | { phase: "enviando"; epc: string; zpl: string }
  | { phase: "verificando"; epc: string }
  | { phase: "confirmado"; epc: string }
  | { phase: "void"; epc: string }
  | { phase: "offline"; epc: string; mensagem: string };

export type PrintAction =
  | { type: "INICIAR_CADASTRO" }
  | { type: "CADASTRO_OK"; epc: string; zpl: string }
  | { type: "INICIAR_ENVIO"; epc: string; zpl: string }
  | { type: "ENVIO_OK"; epc: string }
  | { type: "VERIFICACAO_OK"; epc: string }
  | { type: "VERIFICACAO_VOID"; epc: string }
  | { type: "VERIFICACAO_DIVERGENTE"; epc: string }
  | { type: "VERIFICACAO_OFFLINE"; epc: string; mensagem: string }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function printReducer(state: PrintState, action: PrintAction): PrintState {
  switch (action.type) {
    case "INICIAR_CADASTRO":
      return { phase: "cadastrando" };

    case "CADASTRO_OK":
      return { phase: "enviando", epc: action.epc, zpl: action.zpl };

    case "INICIAR_ENVIO":
      return { phase: "enviando", epc: action.epc, zpl: action.zpl };

    case "ENVIO_OK":
      return { phase: "verificando", epc: action.epc };

    case "VERIFICACAO_OK":
      return { phase: "confirmado", epc: action.epc };

    case "VERIFICACAO_VOID":
      return { phase: "void", epc: action.epc };

    case "VERIFICACAO_DIVERGENTE":
      // Mantém em "verificando" — o componente trata via return value de enviar()
      return { phase: "verificando", epc: action.epc };

    case "VERIFICACAO_OFFLINE":
      return { phase: "offline", epc: action.epc, mensagem: action.mensagem };

    case "RESET":
      return { phase: "idle" };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helper: extrai EPC do estado com type-narrowing
// ---------------------------------------------------------------------------

function extrairEpcDoEstado(state: PrintState): string | null {
  switch (state.phase) {
    case "enviando":
    case "verificando":
    case "confirmado":
    case "void":
    case "offline":
      return state.epc;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Dispatch wrapper types
// ---------------------------------------------------------------------------

export interface PrintFlowActions {
  /**
   * Inicia cadastro de nova etiqueta.
   * 1. Dispara INICIAR_CADASTRO
   * 2. Chama POST /api/rfid/cadastrar
   * 3. Em caso de sucesso, dispara CADASTRO_OK e retorna { ok, epc, zpl }
   * 4. Em caso de erro, dispara RESET e lança CadastrarError
   */
  cadastrar: (produtoId: number) => Promise<{ ok: true; epc: string; zpl: string }>;

  /**
   * Envia ZPL à impressora e interpreta a resposta.
   * O EPC é extraído automaticamente da máquina de estados (fase "enviando").
   *
   * 1. Dispara INICIAR_ENVIO
   * 2. Chama enviarEVerificar do browser-print
   * 3. Interpreta resposta com interpretarRespostaGravacao
   * 4. Dispara ação correspondente (VERIFICACAO_OK, VERIFICACAO_VOID, etc.)
   * 5. Retorna ResultadoGravacao para o componente decidir próximo passo
   *
   * @throws Se o estado atual não contiver EPC (ex.: chamado fora da fase "enviando")
   */
  enviar: (device: ZebraDevice, zpl: string) => Promise<ResultadoGravacao>;

  /**
   * Confirma impressão no backend.
   * Chama POST /api/rfid/confirmar-impressao e, em caso de sucesso,
   * dispara RESET.
   */
  confirmar: (epc: string) => Promise<{ ok: true }>;

  /**
   * Reverte cadastro (rollback) no backend.
   * Chama POST /api/rfid/reverter e, em caso de sucesso,
   * dispara RESET.
   */
  reverter: (epc: string, motivo?: string) => Promise<{ ok: true }>;

  /** Volta ao estado idle. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// CadastrarError (throw customizado)
// ---------------------------------------------------------------------------

export interface CadastrarError {
  status: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook que gerencia o fluxo completo de impressão RFID via state machine.
 *
 * A máquina de estados garante que as transições do fluxo de cadastro
 * sejam previsíveis e auditáveis. Cada função de ação orquestra:
 *   dispatch → chamada de API/I/O → dispatch de resultado
 *
 * Uso típico:
 *   const { state, actions } = usePrintFlow();
 *
 *   // 1. Selecionar produto
 *   const { epc, zpl } = await actions.cadastrar(produtoId);
 *
 *   // 2. Enviar para impressora
 *   const resultado = await actions.enviar(device, zpl);
 *
 *   // 3a. Sucesso → confirmar
 *   if (resultado.status === "ok") {
 *     await actions.confirmar(epc);
 *   }
 *
 *   // 3b. Falha → reverter
 *   if (resultado.status === "void" || resultado.status === "offline") {
 *     await actions.reverter(epc, resultado.mensagem);
 *   }
 */
export function usePrintFlow(): {
  state: PrintState;
  actions: PrintFlowActions;
} {
  const [state, dispatch] = useReducer(printReducer, { phase: "idle" });

  // Ref para acesso ao estado mais recente dentro de callbacks
  // estáveis (evita stale closure e dependência cíclica de [state]).
  const stateRef = useRef(state);
  stateRef.current = state;

  // EPC vivo, setado SÍNCRONO no cadastrar(). O stateRef só reflete o EPC no
  // próximo render, e enviar() roda logo após `await cadastrar()` (antes do
  // re-render) → ler o EPC do estado dá null. O ref elimina essa corrida.
  const epcRef = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // cadastrar
  // -------------------------------------------------------------------------
  const cadastrar = useCallback(
    async (produtoId: number): Promise<{ ok: true; epc: string; zpl: string }> => {
      dispatch({ type: "INICIAR_CADASTRO" });

      try {
        const res = await fetch("/api/rfid/cadastrar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ produto_id: produtoId }),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          const mensagem = data.error ?? "Erro ao cadastrar etiqueta";
          dispatch({ type: "RESET" });
          throw { status: res.status, message: mensagem } satisfies CadastrarError;
        }

        const epc: string = data.epc;
        const zpl: string = data.zpl;

        epcRef.current = epc;
        dispatch({ type: "CADASTRO_OK", epc, zpl });
        return { ok: true as const, epc, zpl };
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "status" in err &&
          "message" in err
        ) {
          throw err; // Já é CadastrarError
        }
        dispatch({ type: "RESET" });
        throw {
          status: 500,
          message: err instanceof Error ? err.message : "Erro inesperado",
        } satisfies CadastrarError;
      }
    },
    [], // dispatch estável do useReducer
  );

  // -------------------------------------------------------------------------
  // enviar (usa stateRef para acessar o EPC mais recente)
  // -------------------------------------------------------------------------
  const enviar = useCallback(
    async (device: ZebraDevice, zpl: string): Promise<ResultadoGravacao> => {
      const currentState = stateRef.current;
      const epc = epcRef.current ?? extrairEpcDoEstado(currentState);

      if (!epc) {
        throw new Error(
          "usePrintFlow.enviar() chamado sem EPC no estado. " +
            "Certifique-se de chamar cadastrar() antes de enviar().",
        );
      }

      dispatch({ type: "INICIAR_ENVIO", epc, zpl });

      try {
        // Envia ZPL e aguarda resposta da impressora
        const raw = await enviarEVerificar(device, zpl);

        // Transição: envio concluído → verificando
        dispatch({ type: "ENVIO_OK", epc });

        // Interpreta resposta (epc é garantido string não-vazio, compatível com Epc)
        const resultado = interpretarRespostaGravacao(raw, epc as Epc);

        // Dispara ação correspondente ao status da verificação
        switch (resultado.status) {
          case "ok":
            dispatch({ type: "VERIFICACAO_OK", epc });
            break;
          case "void":
            dispatch({ type: "VERIFICACAO_VOID", epc });
            break;
          case "divergente":
            dispatch({ type: "VERIFICACAO_DIVERGENTE", epc });
            break;
          case "offline":
          case "no_tag":
            dispatch({
              type: "VERIFICACAO_OFFLINE",
              epc,
              mensagem: resultado.mensagem,
            });
            break;
        }

        return resultado;
      } catch (err: unknown) {
        const mensagem =
          err instanceof Error ? err.message : "Falha ao comunicar com a impressora";
        dispatch({
          type: "VERIFICACAO_OFFLINE",
          epc,
          mensagem,
        });
        return {
          status: "offline",
          epcLido: null,
          mensagem,
        };
      }
    },
    [], // stateRef evita dependência de [state]
  );

  // -------------------------------------------------------------------------
  // confirmar
  // -------------------------------------------------------------------------
  const confirmar = useCallback(
    async (epc: string): Promise<{ ok: true }> => {
      const res = await fetch("/api/rfid/confirmar-impressao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epc }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Erro ao confirmar impressão",
        );
      }

      dispatch({ type: "RESET" });
      return { ok: true as const };
    },
    [],
  );

  // -------------------------------------------------------------------------
  // reverter
  // -------------------------------------------------------------------------
  const reverter = useCallback(
    async (epc: string, motivo?: string): Promise<{ ok: true }> => {
      const body: Record<string, string> = { epc };
      if (motivo) body.motivo = motivo;

      const res = await fetch("/api/rfid/reverter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Erro ao reverter cadastro",
        );
      }

      dispatch({ type: "RESET" });
      return { ok: true as const };
    },
    [],
  );

  // -------------------------------------------------------------------------
  // reset
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    epcRef.current = null;
    dispatch({ type: "RESET" });
  }, []);

  return {
    state,
    actions: { cadastrar, enviar, confirmar, reverter, reset },
  };
}
