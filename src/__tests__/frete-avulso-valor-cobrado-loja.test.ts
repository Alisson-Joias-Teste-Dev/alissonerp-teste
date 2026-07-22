/**
 * Teste ANTI-VOLTA do predicado "Valor cobrado do cliente" no frete avulso
 * SOLICITADO (ajuste 21/07/2026, pedido do Jonathan: "se for loja não
 * precisa colocar o valor cobrado do cliente").
 *
 * O bug que este arquivo prova que não acontece:
 *   com pagante === 'loja', o formulário continuar exigindo (e mostrando) um
 *   campo "valor cobrado do cliente" que não faz sentido nesse caso — a loja
 *   assume o custo integral, não há cobrança ao cliente.
 *
 * Verifica o predicado puro `precisaValorCobradoDoCliente` (extraído de
 * FreteAvulsoModal.tsx para ser testável sem renderizar React — o projeto
 * não tem setup de testing-library/jsdom, vitest.config.ts usa
 * environment:"node"):
 *   - pagante === 'cliente' → true (campo exigido/visível, comportamento
 *     ATUAL intacto)
 *   - pagante === 'loja' → false (campo não exigido, escondido)
 *   - pagante === '' (ainda não escolhido) → false (não é o que bloqueia o
 *     submit nesse caso — quem bloqueia é o próprio `!pagante` em
 *     disabledSolicitacao)
 */
import { describe, it, expect } from "vitest";
import { precisaValorCobradoDoCliente } from "@/lib/frete-avulso-valor-cobrado";

describe("precisaValorCobradoDoCliente — loja não pede valor cobrado do cliente", () => {
  it("pagante='cliente' → exige/mostra o campo (comportamento atual intacto)", () => {
    expect(precisaValorCobradoDoCliente("cliente")).toBe(true);
  });

  it("pagante='loja' → NÃO exige/mostra o campo (a loja assume o custo)", () => {
    expect(precisaValorCobradoDoCliente("loja")).toBe(false);
  });

  it("pagante='' (ainda não escolhido) → não exige por este predicado (quem bloqueia o submit aqui é a falta de `pagante`, não o valor)", () => {
    expect(precisaValorCobradoDoCliente("")).toBe(false);
  });
});
