/**
 * Teste ANTI-VOLTA — relatório de pagamento do motoboy por
 * entregador+período (aba "Pagamento do motoboy", 21/07/2026).
 *
 * Cobre as regras PURAS de `src/lib/relatorio-pagamento-motoboy.ts` — o
 * marco de corte (20/07/2026), a classificação Pagar/Revisar/Não pagar de
 * cada corrida e o somatório do total a pagar. Não precisa mockar
 * banco/auth: a lógica de negócio foi extraída para funções puras
 * exatamente para ser testável sem isso (mesmo padrão de
 * `frete-avulso-alerta-limite.test.ts`).
 */
import { describe, it, expect } from "vitest";
import {
  MARCO_RELATORIO_PAGAMENTO_MOTOBOY,
  periodoAntesDoMarco,
  classificarCorridaMotoboy,
  decisaoInicialFinanceiro,
  calcularTotalPagar,
  calcularTotalAjustado,
  type CorridaParaClassificar,
} from "@/lib/relatorio-pagamento-motoboy";

/** Corrida "normal" de pedido, válida em tudo — base para variar 1 campo por teste. */
function corridaBase(overrides: Partial<CorridaParaClassificar> = {}): CorridaParaClassificar {
  return {
    vendaId: 100,
    vendaSituacao: "entregue",
    isAvulso: false,
    descricaoAvulso: null,
    temCadastroMotoboy: true,
    ordemNaVenda: 1,
    ...overrides,
  };
}

describe("MARCO_RELATORIO_PAGAMENTO_MOTOBOY / periodoAntesDoMarco", () => {
  it("o marco é 2026-07-20 (pagamento manual cobriu até 19/07)", () => {
    expect(MARCO_RELATORIO_PAGAMENTO_MOTOBOY).toBe("2026-07-20");
  });

  it("período começando ANTES do marco (19/07) é barrado", () => {
    expect(periodoAntesDoMarco("2026-07-19")).toBe(true);
  });

  it("período começando NO marco (20/07) é permitido", () => {
    expect(periodoAntesDoMarco("2026-07-20")).toBe(false);
  });

  it("período começando DEPOIS do marco é permitido", () => {
    expect(periodoAntesDoMarco("2026-08-01")).toBe(false);
  });
});

describe("classificarCorridaMotoboy — Não pagar (única certeza automática)", () => {
  it("venda vinculada CANCELADA -> não pagar", () => {
    const r = classificarCorridaMotoboy(corridaBase({ vendaSituacao: "cancelado" }));
    expect(r.classificacao).toBe("nao_pagar");
    expect(r.motivo).toMatch(/cancelada/i);
  });

  it("venda cancelada tem prioridade sobre duplicidade (continua não pagar mesmo com 2ª corrida)", () => {
    const r = classificarCorridaMotoboy(corridaBase({ vendaSituacao: "cancelado", ordemNaVenda: 2 }));
    expect(r.classificacao).toBe("nao_pagar");
    expect(r.motivo).toMatch(/cancelada/i);
  });
});

describe("classificarCorridaMotoboy — Revisar (mudança 21/07: duplicidade é só SUSPEITA, não 'não pagar')", () => {
  it("2ª corrida confirmada da MESMA venda no período -> revisar (o motoboy pode ter feito 2 viagens reais)", () => {
    const r = classificarCorridaMotoboy(corridaBase({ ordemNaVenda: 2 }));
    expect(r.classificacao).toBe("revisar");
    expect(r.motivo).toMatch(/duplicad/i);
  });

  it("3ª corrida (ou mais) da mesma venda também é revisar, não não-pagar", () => {
    expect(classificarCorridaMotoboy(corridaBase({ ordemNaVenda: 3 })).classificacao).toBe("revisar");
  });

  it("1ª corrida da venda (ordem 1) NÃO é duplicidade mesmo com venda_id repetido entre corridas diferentes", () => {
    expect(classificarCorridaMotoboy(corridaBase({ ordemNaVenda: 1 })).classificacao).toBe("pagar");
  });

  it("entrega de PEDIDO cuja venda ainda não está fechada/entregue -> revisar", () => {
    const r = classificarCorridaMotoboy(corridaBase({ vendaSituacao: "em_rota" }));
    expect(r.classificacao).toBe("revisar");
    expect(r.motivo).toMatch(/fechada|entregue/i);
  });

  it("venda 'concluido' também conta como fechada -> pagar (não revisar)", () => {
    expect(classificarCorridaMotoboy(corridaBase({ vendaSituacao: "concluido" })).classificacao).toBe("pagar");
  });

  it("avulsa SEM venda e SEM descrição -> revisar", () => {
    const r = classificarCorridaMotoboy(
      corridaBase({ isAvulso: true, vendaId: null, vendaSituacao: null, descricaoAvulso: null }),
    );
    expect(r.classificacao).toBe("revisar");
    expect(r.motivo).toMatch(/sem venda/i);
  });

  it("avulsa SEM venda mas com descrição em branco (só espaços) -> revisar", () => {
    const r = classificarCorridaMotoboy(
      corridaBase({ isAvulso: true, vendaId: null, vendaSituacao: null, descricaoAvulso: "   " }),
    );
    expect(r.classificacao).toBe("revisar");
  });

  it("avulsa SEM venda mas COM descrição clara -> pagar", () => {
    const r = classificarCorridaMotoboy(
      corridaBase({ isAvulso: true, vendaId: null, vendaSituacao: null, descricaoAvulso: "Levar material à loja" }),
    );
    expect(r.classificacao).toBe("pagar");
  });

  it("avulsa COM venda vinculada não exige 'venda fechada' (janela normal de frete avulso) -> pagar", () => {
    const r = classificarCorridaMotoboy(
      corridaBase({ isAvulso: true, vendaId: 200, vendaSituacao: "aprovado", descricaoAvulso: null }),
    );
    expect(r.classificacao).toBe("pagar");
  });

  it("motoboy sem cadastro em alissonerp.motoboys -> revisar", () => {
    const r = classificarCorridaMotoboy(corridaBase({ temCadastroMotoboy: false }));
    expect(r.classificacao).toBe("revisar");
    expect(r.motivo).toMatch(/cadastro/i);
  });
});

describe("classificarCorridaMotoboy — Pagar", () => {
  it("corrida de pedido normal, venda entregue, sem duplicidade, motoboy cadastrado -> pagar", () => {
    const r = classificarCorridaMotoboy(corridaBase());
    expect(r.classificacao).toBe("pagar");
    expect(r.motivo).toBeNull();
  });
});

describe("decisaoInicialFinanceiro — valor inicial do toggle editável", () => {
  it("sugestão 'pagar' -> decisão inicial 'pagar'", () => {
    expect(decisaoInicialFinanceiro("pagar")).toBe("pagar");
  });

  it("sugestão 'revisar' -> decisão inicial 'nao_pagar' (postura conservadora, exige ação ativa)", () => {
    expect(decisaoInicialFinanceiro("revisar")).toBe("nao_pagar");
  });

  it("sugestão 'nao_pagar' -> decisão inicial 'nao_pagar'", () => {
    expect(decisaoInicialFinanceiro("nao_pagar")).toBe("nao_pagar");
  });
});

describe("calcularTotalPagar — sugestão BRUTA (informativa, não é o total final do relatório)", () => {
  it("soma só as corridas classificadas como 'pagar' — bate com SUM(frete_motoboy) manual", () => {
    const corridas = [
      { classificacao: "pagar" as const, freteMotoboy: 20 },
      { classificacao: "pagar" as const, freteMotoboy: 50 },
      { classificacao: "revisar" as const, freteMotoboy: 30 },
      { classificacao: "nao_pagar" as const, freteMotoboy: 999 },
    ];
    expect(calcularTotalPagar(corridas)).toBe(70);
  });

  it("lista vazia -> total 0 (rota tem que aguentar sem quebrar)", () => {
    expect(calcularTotalPagar([])).toBe(0);
  });

  it("nenhuma corrida 'pagar' -> total 0", () => {
    const corridas = [
      { classificacao: "revisar" as const, freteMotoboy: 30 },
      { classificacao: "nao_pagar" as const, freteMotoboy: 40 },
    ];
    expect(calcularTotalPagar(corridas)).toBe(0);
  });

  it("corrida classificada 'pagar' mas JÁ PAGA em lote anterior não entra na soma (não infla o que falta pagar)", () => {
    const corridas = [
      { classificacao: "pagar" as const, freteMotoboy: 20, foiPago: true },
      { classificacao: "pagar" as const, freteMotoboy: 50, foiPago: false },
    ];
    expect(calcularTotalPagar(corridas)).toBe(50);
  });
});

describe("calcularTotalAjustado — total REAL exibido, depois do financeiro revisar/ajustar cada linha", () => {
  it("soma só as corridas com decisão FINAL 'pagar' (não a sugestão crua)", () => {
    const corridas = [
      // sugestão era 'revisar', mas o financeiro AJUSTOU para 'pagar'
      { decisaoFinal: "pagar" as const, freteMotoboy: 20, foiPago: false },
      // sugestão era 'pagar', mas o financeiro AJUSTOU para 'nao_pagar'
      { decisaoFinal: "nao_pagar" as const, freteMotoboy: 999, foiPago: false },
      { decisaoFinal: "pagar" as const, freteMotoboy: 30, foiPago: false },
    ];
    expect(calcularTotalAjustado(corridas)).toBe(50);
  });

  it("corrida marcada 'pagar' mas já paga (foiPago=true) não entra na soma — não é oferecida de novo", () => {
    const corridas = [
      { decisaoFinal: "pagar" as const, freteMotoboy: 20, foiPago: true },
      { decisaoFinal: "pagar" as const, freteMotoboy: 40, foiPago: false },
    ];
    expect(calcularTotalAjustado(corridas)).toBe(40);
  });

  it("lista vazia -> total 0", () => {
    expect(calcularTotalAjustado([])).toBe(0);
  });
});
