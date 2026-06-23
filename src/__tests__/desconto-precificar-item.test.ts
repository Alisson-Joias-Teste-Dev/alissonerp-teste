/**
 * Testes da FONTE ÚNICA DE DESCONTO (src/lib/desconto/precificar-item.ts).
 * Lógica pura — sem DB, React ou mocks. Trava as decisões do Jonathan (23/06)
 * e o fix do "-3" (distribuição proporcional ouro/pedra).
 *
 * REGRA DE TETO (Jonathan 23/06): prevalece SEMPRE o cadastro do usuário
 * (mx_desconto_permitido). Teto de produto/campanha é IGNORADO.
 */
import { describe, it, expect } from "vitest";
import {
  calcularItemComDesconto,
  calcularTetoDesconto,
  comissaoDaFaixa,
  arredondarMoeda,
  FALLBACK_TETO_DESCONTO_PCT,
  LIMITE_DESCONTO_CARTAO_PADRAO,
  type FaixaComissao,
} from "@/lib/desconto/precificar-item";

// Faixas de exemplo (espelham o formato de alissonerp.faixas_comissao).
const FAIXAS: FaixaComissao[] = [
  { desconto_pct: 0, comissao_pct: 5 },
  { desconto_pct: 10, comissao_pct: 4 },
  { desconto_pct: 20, comissao_pct: 3 },
  { desconto_pct: 30, comissao_pct: 2 },
];

// ── Arredondamento: VALOR REAL (centavos), nunca para reais/dezenas ───────────
describe("arredondarMoeda — mantém o valor real (centavos)", () => {
  it("não arredonda para o real cheio nem para dezena", () => {
    expect(arredondarMoeda(1234.3)).toBe(1234.3);
    expect(arredondarMoeda(1234.01)).toBe(1234.01);
    expect(arredondarMoeda(99.99)).toBe(99.99);
  });
  it("corrige o erro de float clássico (2 casas)", () => {
    expect(arredondarMoeda(0.1 + 0.2)).toBe(0.3);
    expect(arredondarMoeda(1.005)).toBe(1.01);
  });
});

// ── Teto: SÓ o cadastro do usuário, fallback 15, full-access 100 ─────────────
describe("calcularTetoDesconto — só o cadastro do usuário", () => {
  it("usa o valor do cadastro do usuário quando definido", () => {
    expect(calcularTetoDesconto(30, "gerente_loja")).toBe(30);
  });
  it("cadastro vazio/0 → 0% (nada sem aprovação; NÃO usa fallback escondido por cargo)", () => {
    expect(calcularTetoDesconto(0, "gerente_loja")).toBe(FALLBACK_TETO_DESCONTO_PCT);
    expect(calcularTetoDesconto(0, "gerente_loja")).toBe(0);
    expect(calcularTetoDesconto(null, "gerente_loja")).toBe(0);
    expect(calcularTetoDesconto(undefined, "consultora")).toBe(0);
  });
  it("full-access (admin/desenvolvedor) ignora o cadastro = 100", () => {
    expect(calcularTetoDesconto(5, "admin")).toBe(100);
    expect(calcularTetoDesconto(0, "desenvolvedor")).toBe(100);
  });
  it("teto de produto/campanha é IGNORADO — só o cadastro conta", () => {
    // Mesmo cenário das duas gerentes reais: Germana=30 (cadastro), Geovana=0.
    expect(calcularTetoDesconto(30, "gerente_loja")).toBe(30); // Germana
    expect(calcularTetoDesconto(0, "gerente_loja")).toBe(0);   // Geovana → 0, não 50 nem 30 do produto
  });
});

// ── Comissão: faixa, >30% → 0,5%, sem faixa → 0 ──────────────────────────────
describe("comissaoDaFaixa", () => {
  it("desconto acima de 30% → 0,5% fixo", () => {
    expect(comissaoDaFaixa(31, FAIXAS)).toBe(0.5);
    expect(comissaoDaFaixa(50, FAIXAS)).toBe(0.5);
  });
  it("pega a faixa pelo desconto arredondado", () => {
    expect(comissaoDaFaixa(10, FAIXAS)).toBe(4);
    expect(comissaoDaFaixa(20.4, FAIXAS)).toBe(3); // round(20.4)=20
  });
  it("sem faixa correspondente → 0", () => {
    expect(comissaoDaFaixa(7, FAIXAS)).toBe(0);
  });
});

// ── Fórmula do preço (valor real) ────────────────────────────────────────────
describe("calcularItemComDesconto — preço", () => {
  it("aplica desconto simples e mantém centavos exatos", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 1000, pctDesconto: 23, faixasComissao: FAIXAS, role: "admin" });
    expect(r.precoUnitario).toBe(770);
    expect(r.totalItem).toBe(770);
    expect(r.valorDescontoRS).toBe(230);
  });
  it("desconto que dá centavo quebrado NÃO é arredondado para real", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 1234.3, pctDesconto: 0, faixasComissao: FAIXAS, role: "admin" });
    expect(r.precoUnitario).toBe(1234.3); // não vira 1234 nem 1235
  });
  it("respeita quantidade", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 10, quantidade: 3, faixasComissao: FAIXAS, role: "admin" });
    expect(r.precoUnitario).toBe(90);
    expect(r.totalItem).toBe(270);
  });
});

// ── O FIX DO "-3": pedra leva desconto proporcional, ouro nunca negativo ──────
describe("distribuição ouro/pedra proporcional (fix do -3)", () => {
  it("ouro + pedra + gravação == totalItem (sem sobra de centavo)", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pedrasRS: 300, gravacaoRS: 50, pctDesconto: 20,
      faixasComissao: FAIXAS, role: "admin",
    });
    expect(r.valorPedrasRS).toBe(240);    // 300 * 0.8
    expect(r.valorGravacaoRS).toBe(40);   // 50 * 0.8
    expect(r.valorOuroRS).toBe(520);      // resto: 800 - 240 - 40
    expect(arredondarMoeda(r.valorOuroRS + r.valorPedrasRS + r.valorGravacaoRS)).toBe(r.totalItem);
  });
  it("pedra cara + desconto alto NÃO joga o ouro para negativo", () => {
    // Antes: desconto inteiro no ouro com pedra cheia → ouro negativo (o "-3").
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pedrasRS: 900, pctDesconto: 30,
      faixasComissao: FAIXAS, role: "admin",
    });
    expect(r.valorOuroRS).toBeGreaterThanOrEqual(0);
    expect(r.valorPedrasRS).toBe(630); // 900 * 0.7 — pedra também é descontada
  });
});

// ── Teto + aprovação (baseado SÓ no cadastro do usuário) ─────────────────────
describe("teto e aprovação", () => {
  it("desconto dentro do teto do cadastro não precisa de aprovação", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 10, tetoUsuarioPct: 30, role: "gerente_loja", faixasComissao: FAIXAS });
    expect(r.tetoAplicado).toBe(30);
    expect(r.precisaAprovacao).toBe(false);
  });
  it("desconto acima do teto do cadastro precisa de aprovação", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 35, tetoUsuarioPct: 30, role: "gerente_loja", faixasComissao: FAIXAS });
    expect(r.estourouTeto).toBe(true);
    expect(r.precisaAprovacao).toBe(true);
  });
  it("usuário sem teto no cadastro → teto 0: qualquer desconto precisa de aprovação", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 20, tetoUsuarioPct: 0, role: "gerente_loja", faixasComissao: FAIXAS });
    expect(r.tetoAplicado).toBe(0);
    expect(r.precisaAprovacao).toBe(true); // 20 > 0
  });
  it("sem cadastro e SEM desconto (0%) não precisa de aprovação", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 0, tetoUsuarioPct: 0, role: "gerente_loja", faixasComissao: FAIXAS });
    expect(r.tetoAplicado).toBe(0);
    expect(r.estourouTeto).toBe(false);
    expect(r.precisaAprovacao).toBe(false);
  });
  it("full-access nunca precisa de aprovação", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 100, pctDesconto: 99, role: "admin", faixasComissao: FAIXAS });
    expect(r.precisaAprovacao).toBe(false);
  });
});

// ── Comissão na venda (incl. decisão "aprovar → 0,5%") ───────────────────────
describe("comissão do item", () => {
  it("usa a faixa quando dentro do teto", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 1000, pctDesconto: 10, role: "admin", faixasComissao: FAIXAS });
    expect(r.comissaoPct).toBe(4);
    expect(r.valorComissaoRS).toBe(36); // 900 * 4%
  });
  it("desconto > 30% → comissão 0,5%", () => {
    const r = calcularItemComDesconto({ precoListaCheio: 1000, pctDesconto: 40, role: "admin", faixasComissao: FAIXAS });
    expect(r.comissaoPct).toBe(0.5);
    expect(r.valorComissaoRS).toBe(3); // 600 * 0,5%
  });
  it("desconto acima do teto APROVADO → comissão 0,5% mesmo abaixo de 30% (decisão Jonathan)", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 20, tetoUsuarioPct: 15,
      role: "consultora", descontoAprovado: true, faixasComissao: FAIXAS,
    });
    expect(r.precisaAprovacao).toBe(true);
    expect(r.comissaoPct).toBe(0.5);
  });
});

// ── Desconto PROMOCIONAL é pré-aprovado (chefe liberou no módulo de promoções) ─
describe("desconto promocional pré-aprovado", () => {
  it("promoção de 50% NÃO precisa de aprovação, mesmo sem teto cadastrado", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 50, tetoUsuarioPct: 0,
      role: "consultora", pctPreAprovado: 50, faixasComissao: FAIXAS,
    });
    expect(r.tetoAplicado).toBe(50);        // limite = maior(promo 50, cadastro 0)
    expect(r.estourouTeto).toBe(false);     // 50 == 50
    expect(r.precisaAprovacao).toBe(false); // promoção liberada
    expect(r.precoUnitario).toBe(500);
  });
  it("promoção > 30% → comissão 0,5% (regra da faixa, normal)", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 50, pctPreAprovado: 50,
      role: "consultora", faixasComissao: FAIXAS,
    });
    expect(r.comissaoPct).toBe(0.5);
  });
  it("promoção ≤ 30% → comissão da faixa normal (NÃO vira 0,5%)", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 20, tetoUsuarioPct: 0,
      role: "consultora", pctPreAprovado: 20, faixasComissao: FAIXAS,
    });
    expect(r.precisaAprovacao).toBe(false);
    expect(r.comissaoPct).toBe(3); // faixa de 20%, comissão normal
  });
  it("SOLICITAR mais que a promoção (60 numa promo de 50) → precisa aprovação", () => {
    // "ele pode solicitar mais, não empilhar por conta própria": o extra passa pela aprovação.
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 60, tetoUsuarioPct: 0,
      role: "consultora", pctPreAprovado: 50, faixasComissao: FAIXAS,
    });
    expect(r.tetoAplicado).toBe(50);
    expect(r.precisaAprovacao).toBe(true); // 60 > 50
  });
  it("limite = MAIOR entre promoção e cadastro (não soma): promo 20 + cadastro 30 → 30", () => {
    const dentro = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 30, tetoUsuarioPct: 30,
      role: "gerente_loja", pctPreAprovado: 20, faixasComissao: FAIXAS,
    });
    expect(dentro.tetoAplicado).toBe(30);       // max(20, 30) — não 50
    expect(dentro.precisaAprovacao).toBe(false);
    const fora = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 31, tetoUsuarioPct: 30,
      role: "gerente_loja", pctPreAprovado: 20, faixasComissao: FAIXAS,
    });
    expect(fora.precisaAprovacao).toBe(true);   // 31 > 30
  });
  it("desconto MANUAL (sem promoção) acima do teto → precisa aprovação", () => {
    const r = calcularItemComDesconto({
      precoListaCheio: 1000, pctDesconto: 20, tetoUsuarioPct: 0,
      role: "consultora", faixasComissao: FAIXAS,
    });
    expect(r.precisaAprovacao).toBe(true); // 20 > 0 e é manual
  });
});

// ── Constante do cartão exposta (vira parametros_sistema) ─────────────────────
describe("limite cartão", () => {
  it("default 20% exportado para centralizar (antes hardcoded em 4 lugares)", () => {
    expect(LIMITE_DESCONTO_CARTAO_PADRAO).toBe(20);
  });
});
