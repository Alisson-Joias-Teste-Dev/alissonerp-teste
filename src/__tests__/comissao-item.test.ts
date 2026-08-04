/**
 * Comissão do item — a conta que decide o dinheiro.
 *
 * Trava o achado de 03/08/2026: item em promoção media o desconto contra o
 * preço PROMOCIONAL, enxergava ~0% e pagava a faixa cheia de 4% onde a tabela
 * mandava 0,50%. R$ 575,61 em 8 itens de julho/2026.
 * Ver src/lib/comissao-item.ts e docs/regras-negocio/comercial.md §2.1.
 */
import { describe, it, expect } from "vitest";
import { calcularComissaoItem } from "@/lib/comissao-item";
import type { FaixaComissao } from "@/lib/desconto/precificar-item";

// Recorte real de alissonerp.faixas_comissao (31 faixas ativas em 03/08/2026).
const FAIXAS: FaixaComissao[] = [
  { desconto_pct: 0,  comissao_pct: 4.00 },
  { desconto_pct: 14, comissao_pct: 2.37 },
  { desconto_pct: 15, comissao_pct: 2.25 },
  { desconto_pct: 20, comissao_pct: 1.67 },
  { desconto_pct: 28, comissao_pct: 0.73 },
  { desconto_pct: 30, comissao_pct: 0.50 },
];

describe("calcularComissaoItem", () => {
  it("item em PROMOÇÃO: mede contra o preço cheio da campanha, não contra o promocional", () => {
    // Venda 15884 / AJ4895 (31/07/2026): campanha fixou o cheio em 5.960,00 e o
    // item foi gravado com preco_lista = 4.000 (o preço promocional).
    const r = calcularComissaoItem(5960, 4000, 4000, FAIXAS);

    expect(r.desconto_real).toBe(32.89);
    expect(r.pct_comissao).toBe(0.5);   // > 30% → fixo
    expect(r.valor_comissao).toBe(20);
  });

  it("o mesmo item medido contra o preço PROMOCIONAL pagaria a faixa cheia — o bug", () => {
    // Era isto que o navegador fazia quando perdia o preço cheio ao reabrir a
    // venda: cheio = preco_lista = 4.000, desconto 0%, faixa de 0% = 4,00%.
    const bug = calcularComissaoItem(4000, 4000, 4000, FAIXAS);

    expect(bug.desconto_real).toBe(0);
    expect(bug.pct_comissao).toBe(4);
    expect(bug.valor_comissao).toBe(160);
    // 160,00 contra 20,00: os R$ 140,00 a mais da venda 15884.
    expect(bug.valor_comissao - 20).toBe(140);
  });

  it("item sem promoção: cheio == lista, desconto normal cai na faixa", () => {
    const r = calcularComissaoItem(2480, 1984, 1984, FAIXAS);

    expect(r.desconto_real).toBe(20);
    expect(r.pct_comissao).toBe(1.67);
    expect(r.valor_comissao).toBe(33.13);
  });

  it("vendido ACIMA da lista (markup): desconto não fica negativo, vira 0", () => {
    // Venda 15682: promo 1.785, vendido 1.830. Sem o piso em 0 o desconto sairia
    // negativo, ROUND jogaria numa faixa inexistente e a comissão seria 0.
    const r = calcularComissaoItem(1830, 1830, 1830, FAIXAS);

    expect(r.desconto_real).toBe(0);
    expect(r.pct_comissao).toBe(4);
  });

  it("desconto que cai numa faixa não cadastrada devolve 0%, não a faixa vizinha", () => {
    // 25% não está no recorte: comissaoDaFaixa exige match exato do arredondado.
    const r = calcularComissaoItem(1000, 750, 750, FAIXAS);

    expect(r.desconto_real).toBe(25);
    expect(r.pct_comissao).toBe(0);
    expect(r.valor_comissao).toBe(0);
  });

  it("preço cheio zerado não explode nem inventa desconto", () => {
    const r = calcularComissaoItem(0, 0, 0, FAIXAS);

    expect(r.desconto_real).toBe(0);
    expect(r.pct_comissao).toBe(4);
    expect(r.valor_comissao).toBe(0);
  });

  it("arredonda o desconto antes de procurar a faixa (28,24% → faixa de 28)", () => {
    // Venda 15682 / AJ4661: cheio 2.550, vendido 1.830.
    const r = calcularComissaoItem(2550, 1830, 1830, FAIXAS);

    expect(r.desconto_real).toBe(28.24);
    expect(r.pct_comissao).toBe(0.73);
    expect(r.valor_comissao).toBe(13.36);
  });

  it("total_item manda no valor, não o preço unitário (quantidade > 1)", () => {
    const r = calcularComissaoItem(2480, 1984, 3968, FAIXAS);

    expect(r.pct_comissao).toBe(1.67);
    expect(r.valor_comissao).toBe(66.27);
  });

  it("sem faixa nenhuma cadastrada, só sobra o fixo de 0,5% acima de 30%", () => {
    expect(calcularComissaoItem(1000, 500, 500, []).pct_comissao).toBe(0.5);
    expect(calcularComissaoItem(1000, 900, 900, []).pct_comissao).toBe(0);
  });
});
