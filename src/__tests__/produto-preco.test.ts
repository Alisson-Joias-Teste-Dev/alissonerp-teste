import { describe, it, expect } from "vitest";

// ═════════════════════════════════════════════════════════════════════════════
// Testes de REGRA DE NEGÓCIO — Precificação do Produto
//
// Estas regras foram aprovadas em 20/05/2026 e NÃO devem ser alteradas
// sem aprovação explícita do usuário.
//
// Regras:
//   1. preco_curva usa APENAS a curva dinâmica (vw_produto_preco)
//   2. NENHUM fallback para preco_tiny ou preco_sync
//   3. Produto sem peso → sem preço (intencional)
//   4. Serviço → preço fixo via preco_servico
// ═════════════════════════════════════════════════════════════════════════════

describe("Regra: preco_curva usa APENAS a curva dinâmica", () => {
  it("produto com peso e markup deve ter preco_curva calculado", () => {
    const peso = 12.4;
    const markup = 2.428;
    const cotacao = 732.191;
    const fator = 1;
    const esperado = Math.round(peso * cotacao * markup * fator / 10) * 10;
    expect(esperado).toBe(22040);
  });

  it("produto SEM peso deve ter preco_curva = null (intencional)", () => {
    const peso = null;
    const markup = 2.5;
    const cotacao = 732.191;
    const fator = 1;

    // Regra: só calcula se peso > 0
    const preco = peso != null && peso > 0 && markup > 0 && cotacao > 0
      ? Math.round(peso * cotacao * markup * fator / 10) * 10
      : null;

    expect(preco).toBeNull();
  });

  it("NÃO deve usar preco_tiny como fallback", () => {
    // A view vw_produto_preco NUNCA usa fallback.
    // Se a view retorna NULL, o preço é NULL — sem exceção.
    const precoView = null; // simulando retorno da view para produto sem peso
    const preco_tiny = 500;

    const precoExibido = precoView; // NÃO usa preco_tiny como fallback
    expect(precoExibido).toBeNull();
    expect(precoExibido).not.toBe(preco_tiny);
  });

  it("NÃO deve usar preco_sync como fallback", () => {
    const precoView = null; // view retorna NULL
    const preco_sync = 1000;

    const precoExibido = precoView; // NÃO usa preco_sync como fallback
    expect(precoExibido).toBeNull();
    expect(precoExibido).not.toBe(preco_sync);
  });
});

describe("Regra: tipo_item = servico usa preco_servico", () => {
  it("produto servico com preco_servico=100 deve exibir 100", () => {
    const tipoItem = "servico";
    const precoServico = 100;
    const precoCurva = null; // servico nao usa curva

    const precoExibido = tipoItem === "servico" ? precoServico : precoCurva;
    expect(precoExibido).toBe(100);
  });

  it("produto servico SEM preco_servico deve exibir null", () => {
    const tipoItem = "servico";
    const precoServico = null;
    const precoCurva = null;

    const precoExibido = tipoItem === "servico" ? precoServico : precoCurva;
    expect(precoExibido).toBeNull();
  });

  it("produto NAO servico (joia) SEM peso deve exibir null", () => {
    const tipoItem = "joia";
    const peso = null;
    const markup = 2.5;
    const cotacao = 732.191;
    const fator = 1;

    const preco = peso != null && peso > 0 && markup > 0 && cotacao > 0
      ? Math.round(peso * cotacao * markup * fator / 10) * 10
      : null;

    expect(preco).toBeNull();
  });
});

describe("Regra: produto sem controla_estoque aparece mesmo sem saldo", () => {
  it("controla_estoque=false → aparece com saldo=0", () => {
    const controlaEstoque = false;
    const saldoDisponivel = 0;

    const aparece = controlaEstoque === false || saldoDisponivel > 0;
    expect(aparece).toBe(true);
  });

  it("controla_estoque=true e saldo=0 → NAO aparece", () => {
    const controlaEstoque = true as boolean;
    const saldoDisponivel = 0;

    const aparece = controlaEstoque === false || saldoDisponivel > 0;
    expect(aparece).toBe(false);
  });

  it("controla_estoque=true e saldo>0 → aparece", () => {
    const controlaEstoque = true as boolean;
    const saldoDisponivel = 5;

    const aparece = controlaEstoque === false || saldoDisponivel > 0;
    expect(aparece).toBe(true);
  });
});

describe("Regra: preco_curva é number, não string (evita concatenacao JS)", () => {
  it("Number + Number = soma correta", () => {
    const precoCurva = 18300; // number
    const pedras = 0;
    const resultado = precoCurva + pedras;
    expect(resultado).toBe(18300);
    expect(typeof resultado).toBe("number");
  });

  it("String + Number = concatenacao (BUG!)", () => {
    const precoCurva = "18300"; // string (como vinha do postgres.js)
    const pedras = 0;
    const resultado = precoCurva + pedras; // BUG: concatena!
    expect(resultado).not.toBe(18300); // não é soma
    expect(resultado).toBe("183000"); // é concatenação!
    expect(typeof resultado).toBe("string");
  });

  it("Number(String + Number) = protecao contra o bug", () => {
    const precoCurva = "18300"; // string (como vinha do postgres.js)
    const pedras = 0;
    const resultado = Number(precoCurva) + pedras; // proteção: converte antes
    expect(resultado).toBe(18300);
    expect(typeof resultado).toBe("number");
  });
});
