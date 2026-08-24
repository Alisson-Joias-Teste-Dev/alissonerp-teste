/**
 * REGRA DE NEGÓCIO: comparação de PESO DE OURO em gramas — tolerância de meio miligrama.
 *
 * O QUE: `excedeRestante(peso, restante)` responde se um peso pedido realmente passa do
 *   restante disponível de uma origem no Caixa de Ouro, ignorando erro de arredondamento.
 *
 * O PORQUÊ: o restante é calculado em JavaScript (`Number(peso_origem) - Number(baixado)`),
 *   e ponto flutuante não fecha em decimal. Caso real (24/08/2026, compra CM-2026-0056):
 *   95,420 − 83,450 = 11.969999999999999. A tela mostrava "máx 11.970g", já pré-enchia o
 *   campo com 11,970 — e recusava esse mesmo valor, porque 11.97 > 11.969999999999999.
 *   Resultado: era IMPOSSÍVEL converter o último restante da origem, na tela, na API de
 *   abrir e na de aprovar (as três faziam a comparação crua).
 *   As colunas de peso são numeric(10,3) (upgrade: 10,4), então o menor peso real que
 *   existe é 0,001 g — meio miligrama de tolerância nunca libera uma saída de verdade
 *   além do que há no cofre, só absorve o ruído do float.
 *
 * IMPACTO SE REMOVIDO/ALTERADO: volta a travar a conversão do último resto de cada origem
 *   (ouro fica preso no cofre sem poder virar joia). Se a tolerância crescer para 0,001 g
 *   ou mais, passa a permitir saída maior que o saldo — ouro é dinheiro, não aumentar.
 */

/** Meio miligrama — metade do menor peso representável nas colunas de peso (numeric x,3). */
export const EPSILON_GRAMAS = 0.0005;

/** true quando `peso` passa de verdade do `restante` (fora da tolerância de arredondamento). */
export function excedeRestante(peso: number, restante: number): boolean {
  return peso > restante + EPSILON_GRAMAS;
}
