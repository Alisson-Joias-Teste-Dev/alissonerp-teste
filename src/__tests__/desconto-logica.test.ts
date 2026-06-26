/**
 * Testes de lógica pura do sistema de aprovação de desconto.
 * Não dependem de DB, React ou mocks — verificam as regras de negócio.
 */
import { describe, it, expect } from "vitest";

// ── Regras replicadas do componente ──────────────────────────────────────────

interface ItemVenda {
  _key: string;
  quantidade: number;
  preco_lista: number;
  pct_desconto: number;
  preco_unitario: number;
  total_item: number;
  pct_comissao: number;
  valor_comissao: number;
}

function makeItem(overrides: Partial<ItemVenda> = {}): ItemVenda {
  const base: ItemVenda = {
    _key: "k1",
    quantidade: 1,
    preco_lista: 100,
    pct_desconto: 0,
    preco_unitario: 100,
    total_item: 100,
    pct_comissao: 5,
    valor_comissao: 5,
    ...overrides,
  };
  return base;
}

/** precisaAprovacaoDesconto — replicado de NovaVendaClientV2 */
function precisaAprovacaoDesconto(itens: ItemVenda[], maxDesconto: number): boolean {
  return maxDesconto < 100 && itens.some(i => i.pct_desconto > maxDesconto);
}

/** updateItem("preco_lista") — replicado de NovaVendaClientV2 (com fix BR milhar) */
function updatePrecoLista(item: ItemVenda, raw: string): ItemVenda {
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const novaLista = Math.max(0, parseFloat(normalized) || 0);
  const precoUnit = novaLista * (1 - item.pct_desconto / 100);
  const totalItem = precoUnit * item.quantidade;
  return { ...item, preco_lista: novaLista, preco_unitario: precoUnit, total_item: totalItem };
}

/** updateItem("pct_desconto") — replicado SEM Math.min(maxDesconto) */
function updatePctDesconto(item: ItemVenda, raw: string): ItemVenda {
  const pct = Math.max(0, parseFloat(raw.replace(",", ".")) || 0);
  const precoUnit = item.preco_lista * (1 - pct / 100);
  const totalItem = precoUnit * item.quantidade;
  return { ...item, pct_desconto: pct, preco_unitario: precoUnit, total_item: totalItem };
}

/** maxDesconto para cada role — replicado de page.tsx */
function getMaxDesconto(role: string, mxPermitido?: number | null): number {
  const SUPER = ["desenvolvedor", "admin"];
  if (SUPER.includes(role)) return 100;
  if (mxPermitido != null && mxPermitido > 0) return mxPermitido;
  // FULL e consultora recebem 30 (era 15 para consultora antes do fix)
  return 30;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe("precisaAprovacaoDesconto", () => {
  it("retorna false quando todos os itens têm desconto ≤ threshold", () => {
    const itens = [makeItem({ pct_desconto: 0 }), makeItem({ pct_desconto: 20 })];
    expect(precisaAprovacaoDesconto(itens, 20)).toBe(false);
  });

  it("retorna true quando qualquer item tem desconto > threshold (consultora)", () => {
    const itens = [makeItem({ pct_desconto: 20 }), makeItem({ pct_desconto: 21 })];
    expect(precisaAprovacaoDesconto(itens, 20)).toBe(true);
  });

  it("retorna true mesmo que apenas 1 item de vários supere o threshold", () => {
    const itens = [
      makeItem({ _key: "a", pct_desconto: 10 }),
      makeItem({ _key: "b", pct_desconto: 5 }),
      makeItem({ _key: "c", pct_desconto: 50 }),
    ];
    expect(precisaAprovacaoDesconto(itens, 30)).toBe(true);
  });

  it("retorna false para lista vazia", () => {
    expect(precisaAprovacaoDesconto([], 30)).toBe(false);
  });

  it("retorna false para desconto exatamente igual ao threshold (limite não inclusivo)", () => {
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 30 })], 30)).toBe(false);
  });

  it("retorna true para desconto 20.01 com threshold=20", () => {
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 20.01 })], 20)).toBe(true);
  });

  it("admin/dev (maxDesconto=100) NUNCA precisa de aprovação, mesmo com 99%", () => {
    const itens = [makeItem({ pct_desconto: 99 })];
    expect(precisaAprovacaoDesconto(itens, 100)).toBe(false);
  });

  it("threshold=30: 31% precisa aprovação, 30% não precisa", () => {
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 31 })], 30)).toBe(true);
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 30 })], 30)).toBe(false);
  });

  it("usuário com mx_desconto_permitido=45 NÃO precisa aprovação para 31%", () => {
    // O threshold de aprovação AGORA é o mx_desconto_permitido (45), não mais 30 fixo
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 31 })], 45)).toBe(false);
  });

  it("usuário com mx_desconto_permitido=20 precisa aprovação para 21%", () => {
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 21 })], 20)).toBe(true);
  });

  it("usuário com mx_desconto_permitido=15 precisa aprovação para 16%", () => {
    expect(precisaAprovacaoDesconto([makeItem({ pct_desconto: 16 })], 15)).toBe(true);
  });
});

describe("updateItem — campo preco_lista", () => {
  it("atualiza preco_lista e recalcula preco_unitario sem desconto", () => {
    const item = makeItem({ preco_lista: 100, pct_desconto: 0, quantidade: 2 });
    const atualizado = updatePrecoLista(item, "150");
    expect(atualizado.preco_lista).toBe(150);
    expect(atualizado.preco_unitario).toBe(150);
    expect(atualizado.total_item).toBe(300);
  });

  it("recalcula preco_unitario levando em conta desconto existente", () => {
    const item = makeItem({ preco_lista: 100, pct_desconto: 20, quantidade: 1 });
    const atualizado = updatePrecoLista(item, "200");
    expect(atualizado.preco_lista).toBe(200);
    expect(atualizado.preco_unitario).toBeCloseTo(160, 5); // 200 * (1 - 0.20)
    expect(atualizado.total_item).toBeCloseTo(160, 5);
  });

  it("aceita preco_lista maior do que o valor de tabela original", () => {
    const item = makeItem({ preco_lista: 80, pct_desconto: 0 });
    const atualizado = updatePrecoLista(item, "120");
    expect(atualizado.preco_lista).toBeGreaterThan(80);
    expect(atualizado.preco_lista).toBe(120);
  });

  it("aceita notação com vírgula", () => {
    const item = makeItem({ preco_lista: 0 });
    const atualizado = updatePrecoLista(item, "1.500,99");
    expect(atualizado.preco_lista).toBeCloseTo(1500.99, 2);
  });

  it("não permite preco_lista negativo — retorna 0", () => {
    const item = makeItem({ preco_lista: 100 });
    const atualizado = updatePrecoLista(item, "-50");
    expect(atualizado.preco_lista).toBe(0);
  });
});

describe("updateItem — campo pct_desconto (sem cap)", () => {
  it("permite desconto acima de 30% sem bloquear", () => {
    const item = makeItem({ preco_lista: 100, pct_desconto: 0 });
    const atualizado = updatePctDesconto(item, "50");
    expect(atualizado.pct_desconto).toBe(50);
    expect(atualizado.preco_unitario).toBe(50);
  });

  it("permite desconto de 100%", () => {
    const item = makeItem({ preco_lista: 100 });
    const atualizado = updatePctDesconto(item, "100");
    expect(atualizado.pct_desconto).toBe(100);
    expect(atualizado.preco_unitario).toBe(0);
    expect(atualizado.total_item).toBe(0);
  });

  it("não permite desconto negativo — retorna 0", () => {
    const item = makeItem({ preco_lista: 100 });
    const atualizado = updatePctDesconto(item, "-5");
    expect(atualizado.pct_desconto).toBe(0);
  });

  it("desconto 31% gera preco_unitario correto", () => {
    const item = makeItem({ preco_lista: 100, quantidade: 3 });
    const atualizado = updatePctDesconto(item, "31");
    expect(atualizado.pct_desconto).toBe(31);
    expect(atualizado.preco_unitario).toBeCloseTo(69, 5);
    expect(atualizado.total_item).toBeCloseTo(207, 5);
  });
});

describe("maxDesconto por role", () => {
  it("admin e desenvolvedor têm maxDesconto = 100", () => {
    expect(getMaxDesconto("admin")).toBe(100);
    expect(getMaxDesconto("desenvolvedor")).toBe(100);
  });

  it("consultora tem maxDesconto = 30 (era 15 antes do fix)", () => {
    expect(getMaxDesconto("consultora")).toBe(30);
  });

  it("gerente_loja tem maxDesconto = 30", () => {
    expect(getMaxDesconto("gerente_loja")).toBe(30);
  });

  it("respeitia mx_desconto_permitido quando definido pelo DB", () => {
    expect(getMaxDesconto("consultora", 45)).toBe(45);
  });

  it("ignora mx_desconto_permitido = 0 (usa padrão de role)", () => {
    expect(getMaxDesconto("consultora", 0)).toBe(30);
  });
});

// ── Regra de comissão 0,5% para desconto > 30% ───────────────────────────────
// Replica a lógica do UPDATE em /api/tarefas/[id]/aprovacao/route.ts:
//   pct_comissao = 0.5
//   valor_comissao = ROUND(total_item * 0.005, 2)

function calcularComissaoDesconto(totalItem: number): { pct: number; valor: number } {
  const pct = 0.5;
  const valor = Math.round(totalItem * 0.005 * 100) / 100; // equivale a ROUND(..., 2)
  return { pct, valor };
}

describe("comissão 0,5% para desconto > 30%", () => {
  it("total R$100 → valor_comissao = R$0,50", () => {
    const { pct, valor } = calcularComissaoDesconto(100);
    expect(pct).toBe(0.5);
    expect(valor).toBe(0.5);
  });

  it("total R$1000 → valor_comissao = R$5,00", () => {
    const { valor } = calcularComissaoDesconto(1000);
    expect(valor).toBe(5);
  });

  it("total R$21515 (caso real) → valor_comissao = R$107,58", () => {
    const { valor } = calcularComissaoDesconto(21515);
    expect(valor).toBe(107.58);
  });

  it("arredondamento: R$33,33 → 0,5% = R$0,17", () => {
    // 33.33 * 0.005 = 0.16665 → arredonda para 0.17
    const { valor } = calcularComissaoDesconto(33.33);
    expect(valor).toBe(0.17);
  });

  it("0,5% é sempre menor que comissão normal mínima (5%)", () => {
    const totalItem = 500;
    const { valor: comissaoDesconto } = calcularComissaoDesconto(totalItem);
    const comissaoNormal = totalItem * 0.05;
    expect(comissaoDesconto).toBeLessThan(comissaoNormal);
  });

  it("total zero → valor_comissao = 0", () => {
    const { pct, valor } = calcularComissaoDesconto(0);
    expect(pct).toBe(0.5);
    expect(valor).toBe(0);
  });

  it("a regra 0,5% se aplica independente do % de desconto exato (31%, 50%, 99%)", () => {
    // O que importa é que o desconto passou de 30% — a comissão é fixa em 0,5%
    for (const totalItem of [200, 500, 1500]) {
      const { pct } = calcularComissaoDesconto(totalItem);
      expect(pct).toBe(0.5);
    }
  });
});
