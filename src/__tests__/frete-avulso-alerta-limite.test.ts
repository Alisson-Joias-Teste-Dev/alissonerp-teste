/**
 * Teste ANTI-VOLTA da regra de AVISO de valor alto no frete avulso
 * (BLOCO 4, jul/2026, P2 — decisão do Jonathan).
 *
 * O bug que este arquivo prova que não acontece:
 *   aprovador decidindo (Aprovar/Rejeitar) sem NENHUM sinal visual quando o
 *   frete do motoboy é caro — nem bloqueio (nunca existiu, é decisão
 *   explícita do Jonathan) nem aviso.
 *
 * Verifica o predicado puro `precisaAlertaFreteMotoboy` (extraído de
 * TarefaDrawer.tsx pra ser testável sem renderizar React):
 *   - valor > LIMITE_ALERTA_FRETE_MOTOBOY (R$ 200) → true (alerta)
 *   - valor <= LIMITE_ALERTA_FRETE_MOTOBOY → false (sem alerta)
 *   - null/undefined (dado ainda não carregado) → false, nunca alerta
 */
import { describe, it, expect } from "vitest";
import { LIMITE_ALERTA_FRETE_MOTOBOY, precisaAlertaFreteMotoboy } from "@/lib/frete-avulso-alerta";

describe("precisaAlertaFreteMotoboy — limite do aviso (sem bloquear aprovação)", () => {
  it("constante do limite é R$ 200 (a decisão do Jonathan)", () => {
    expect(LIMITE_ALERTA_FRETE_MOTOBOY).toBe(200);
  });

  it("valor acima do limite (R$ 200,01) → alerta", () => {
    expect(precisaAlertaFreteMotoboy(200.01)).toBe(true);
  });

  it("valor bem acima do limite (R$ 500) → alerta", () => {
    expect(precisaAlertaFreteMotoboy(500)).toBe(true);
  });

  it("valor exatamente no limite (R$ 200) → SEM alerta (é '>', não '>=')", () => {
    expect(precisaAlertaFreteMotoboy(200)).toBe(false);
  });

  it("valor abaixo do limite (R$ 50) → sem alerta", () => {
    expect(precisaAlertaFreteMotoboy(50)).toBe(false);
  });

  it("valor zero → sem alerta", () => {
    expect(precisaAlertaFreteMotoboy(0)).toBe(false);
  });

  it("null (dado ainda não carregado) → sem alerta, nunca quebra a tela", () => {
    expect(precisaAlertaFreteMotoboy(null)).toBe(false);
  });

  it("undefined → sem alerta", () => {
    expect(precisaAlertaFreteMotoboy(undefined)).toBe(false);
  });
});
