/**
 * frete-avulso-valor-cobrado.ts — regra do campo "Valor cobrado do cliente"
 * no frete avulso SOLICITADO (ajuste 21/07/2026, pedido do Jonathan: "se for
 * loja não precisa colocar o valor cobrado do cliente").
 *
 * O QUE: quando quem paga o frete avulso é a LOJA, não existe "valor cobrado
 * do cliente" a informar — a loja assume o custo integral da corrida
 * (freteCobrado enviado ao backend = 0). O campo só faz sentido, e só é
 * exigido, quando pagante === 'cliente'.
 *
 * POR QUE: extraído para um arquivo à parte (mesmo padrão de
 * frete-avulso-alerta.ts) em vez de ficar só dentro do JSX de
 * FreteAvulsoModal.tsx, pelos mesmos dois motivos de lá:
 *   1. Regra nomeada e comentada, não uma condição solta espalhada em 3
 *      lugares do componente (validação do submit, disabled do botão e
 *      visibilidade do campo).
 *   2. Função pura testável sem precisar renderizar o componente React —
 *      este projeto não tem setup de testing-library/jsdom (vitest.config.ts
 *      usa environment:"node"), então o predicado é o que dá pra exercitar
 *      em teste automatizado (ver
 *      src/__tests__/frete-avulso-valor-cobrado-loja.test.ts).
 *
 * Sem migration nova: é só front + validação — o backend
 * (`z.number().nonnegative()` em route.ts + `criarFreteAvulso` em
 * entrega-venda.ts) já aceitava freteCobrado = 0.
 *
 * IMPACTO SE ALTERADO: muda os 3 pontos de uma vez (validação, disabled,
 * visibilidade) — se voltar a exigir/mostrar o campo com pagante='loja', a
 * solicitação fica travada pedindo um valor que não existe nesse caso.
 */

/**
 * Decide se o campo "Valor cobrado do cliente" é exigido e deve ser exibido
 * no modo solicitação. `""` (ainda não escolhido) e `"loja"` → false;
 * `"cliente"` → true.
 */
export function precisaValorCobradoDoCliente(pagante: "loja" | "cliente" | ""): boolean {
  return pagante === "cliente";
}
