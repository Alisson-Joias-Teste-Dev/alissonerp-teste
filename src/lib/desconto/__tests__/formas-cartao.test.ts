/**
 * Trava do CARTÃO por desconto acima do limite: QUAIS formas ela pega.
 *
 * Esta regra virou 2x em 2 dias e não tinha teste nenhum — por isso existe este
 * arquivo. Ele importa a função REAL (não replica a lógica), então serve de
 * trava contra alguém reverter sem querer.
 *
 * Histórico (o "porquê" completo está no comentário de FORMAS_PAGAMENTO_CARTAO):
 *  - 16/07: as manuais ENTRARAM — qualquer usuário via essas formas, então dava
 *    pra pular a aprovação escolhendo "Manual (MP)" em vez de "Cartão de Crédito".
 *  - 17/07: SAÍRAM — o PR #99 escondeu as manuais de não-admin.
 *  - 17/07 (final): "Manual (MP)" foi liberado de volta pra TODOS e fica fora da
 *    trava DE PROPÓSITO — decisão do Jonathan: na loja ele não é cartão, é
 *    confirmação por ID de transação. Pra ele não há furo, então a liberação de
 *    visibilidade NÃO reabre nada. "Manual (PagBank)" segue restrito a admin.
 */
import { describe, it, expect } from "vitest";
import { FORMAS_PAGAMENTO_CARTAO, ehFormaCartao } from "../precificar-item";
import { FORMAS_RESTRITAS_ADMIN } from "@/components/vendas/PagamentoForm";

describe("ehFormaCartao — quem a trava do cartão pega", () => {
  it("pega Cartão de Crédito", () => {
    expect(ehFormaCartao("Cartão de Crédito")).toBe(true);
  });

  it("NÃO pega as formas manuais (decisão 17/07 — o seletor já as esconde de não-admin)", () => {
    expect(ehFormaCartao("Manual (MP)")).toBe(false);
    expect(ehFormaCartao("Manual (PagBank)")).toBe(false);
  });

  it("NÃO pega as formas que não são cartão", () => {
    for (const forma of ["Dinheiro", "Pix", "Ouro", "Vale-Troca", "A Receber", "Múltiplas"]) {
      expect(ehFormaCartao(forma)).toBe(false);
    }
  });

  it("não quebra com null/undefined/vazio (o seletor começa sem forma escolhida)", () => {
    expect(ehFormaCartao(null)).toBe(false);
    expect(ehFormaCartao(undefined)).toBe(false);
    expect(ehFormaCartao("")).toBe(false);
  });

  it("a lista é exatamente ['Cartão de Crédito'] — pino contra revert acidental", () => {
    expect([...FORMAS_PAGAMENTO_CARTAO]).toEqual(["Cartão de Crédito"]);
  });

  it("casa a forma exata, sem normalizar (o valor vem do seletor, não do usuário)", () => {
    expect(ehFormaCartao("cartão de crédito")).toBe(false);
    expect(ehFormaCartao("Cartao de Credito")).toBe(false);
  });
});

describe("FORMAS_RESTRITAS_ADMIN — quem o seletor esconde de não-admin", () => {
  it("é exatamente ['Manual (PagBank)'] — Manual (MP) foi liberado pra todos (17/07)", () => {
    // Se este teste quebrar porque alguém re-adicionou "Manual (MP)": foi decisão
    // do Jonathan que Manual (MP) aparece pra TODOS (não é cartão na loja). NÃO
    // "conserte" devolvendo ele pra cá — confirme com ele primeiro.
    expect([...FORMAS_RESTRITAS_ADMIN]).toEqual(["Manual (PagBank)"]);
  });

  it("Manual (MP) NÃO está escondido (o pedido explícito deste ajuste)", () => {
    expect(FORMAS_RESTRITAS_ADMIN).not.toContain("Manual (MP)");
  });
});
