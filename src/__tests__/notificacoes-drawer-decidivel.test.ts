/**
 * Teste ANTI-VOLTA — BLOCO 5 (jul/2026), P3(b): NotificacoesDrawer.tsx mostrava
 * o botão "Aprovar →" pra QUALQUER notificação tipo='aprovacao' que casasse
 * `?abrir=`, sem checar se ainda havia algo pendente pra decidir. Como o
 * PATCH /api/tarefas/[id]/aprovacao usa `tipo: 'aprovacao'` tanto pro pedido
 * ("Aprovação solicitada") quanto pro DESFECHO enviado a quem solicitou
 * ("Frete avulso liberado/recusado", "Cartão de crédito liberado!/não
 * aprovado" etc. — ver grep por `tipo: "aprovacao"` em
 * src/app/api/tarefas/[id]/aprovacao/route.ts), a consultora que só solicitou
 * via "Aprovar →" na notificação do PRÓPRIO desfecho e, se clicasse, tomava
 * 403 (nada mais pra decidir).
 *
 * `tarefaAindaDecidivel()` é o predicado central desse gate — testado aqui
 * isoladamente (função pura, sem precisar montar o componente React).
 */
import { describe, it, expect } from "vitest";
import { tarefaAindaDecidivel } from "@/components/NotificacoesDrawer";

describe("tarefaAindaDecidivel — BLOCO 5, P3(b)", () => {
  it("status 'aguardando_aprovacao' + pode_decidir=true → TEM o que decidir", () => {
    expect(tarefaAindaDecidivel({ status: "aguardando_aprovacao", podeDecidir: true })).toBe(true);
  });

  it("notificação de DESFECHO (tarefa já 'aprovada') → NÃO oferece decisão, mesmo se pode_decidir ainda vier true", () => {
    // Regressão real: um 2º/3º aprovador configurado (multiAprovadorCond)
    // continua "pode_decidir=true" na config mesmo depois de OUTRO aprovador
    // já ter decidido — o status da TAREFA é quem trava a ação (evita reenviar
    // uma decisão já resolvida).
    expect(tarefaAindaDecidivel({ status: "aprovada", podeDecidir: true })).toBe(false);
  });

  it("notificação de DESFECHO ('rejeitada') → NÃO oferece decisão", () => {
    expect(tarefaAindaDecidivel({ status: "rejeitada", podeDecidir: true })).toBe(false);
  });

  it("solicitante recebendo o próprio desfecho (pode_decidir=false) → NÃO oferece decisão", () => {
    expect(tarefaAindaDecidivel({ status: "aguardando_aprovacao", podeDecidir: false })).toBe(false);
  });

  it("info ainda não carregado (undefined) → conservador, NÃO oferece decisão", () => {
    expect(tarefaAindaDecidivel(undefined)).toBe(false);
  });
});
