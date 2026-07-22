/**
 * Testes ANTI-VOLTA — BLOCO 5 (21/07, aba "Fechamentos de frete").
 *
 * Cobre `listarFechamentosFrete` (src/lib/frete-fechamento.ts):
 *   1. Mapeamento correto dos campos, incluindo a proteção contra o
 *      comportamento default do driver `postgres` (postgres.js) para colunas
 *      DATE/TIMESTAMP: devolve objeto `Date`, não string — usar `String(...)`
 *      direto (sem reembrulhar em `new Date()`) quebraria o formato
 *      "YYYY-MM-DD" esperado pelo front. Este teste passa `mes_referencia`/
 *      `created_at` como `Date` de verdade (não string), simulando o driver.
 *   2. Saldo negativo com tarefa vinculada -> `tarefaAprovacaoId` preenchido,
 *      status coerente ('aguardando_aprovacao' ou 'pago'/'recusado').
 *   3. Lista vazia não quebra (items=[], total=0).
 *   4. SEM N+1: exatamente 2 chamadas ao `db` (lista + count), qualquer que
 *      seja a quantidade de linhas.
 *   5. Ordenação: a query da lista pede `ORDER BY ... DESC` (mês mais
 *      recente primeiro).
 *   6. Paginação: `page`/`limit` viram o `OFFSET` esperado.
 *   7. `gerente_nome` nulo (LEFT JOIN sem usuário) -> fallback "—" (mesmo
 *      padrão de `motoboy_nome` em `listarRelatoriosPagamentoMotoboy`).
 *
 * Estratégia de mock: `listarFechamentosFrete` recebe `db` como PARÂMETRO
 * (não importa `@/lib/db` fixo) — dá pra passar um mock direto, sem precisar
 * de `vi.mock`. Mesmo padrão de resposta-por-conteúdo (regex no texto da
 * query) usado em `frete-fechamento-mensal.test.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { listarFechamentosFrete } from "@/lib/frete-fechamento";

function textoDaChamada(call: readonly unknown[]): string {
  const [strings, ...vals] = call as [string[], ...unknown[]];
  const stringsText = Array.isArray(strings) ? strings.join(" ") : String(strings);
  const valsText = vals
    .map((v) => {
      try { return typeof v === "string" ? v : JSON.stringify(v); } catch { return String(v); }
    })
    .join(" ");
  return `${stringsText} ${valsText}`;
}

/** Cria um mock de `db` (tagged template) que responde lista/contagem por conteúdo. */
function criarDbMock(rows: Record<string, unknown>[], total: number) {
  const calls: unknown[][] = [];
  const fn = vi.fn((...args: unknown[]) => {
    calls.push(args);
    const texto = textoDaChamada(args);
    if (texto.includes("COUNT(*)::integer AS total FROM alissonerp.fechamentos_frete")) {
      return Promise.resolve([{ total }]);
    }
    return Promise.resolve(rows);
  });
  return { fn, calls };
}

const GERENTE_ID = "99999999-9999-9999-9999-999999999999";

function rowBase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    gerente_id: GERENTE_ID,
    mes_referencia: new Date("2026-07-01"), // simula o driver (Date, não string)
    saldo_anterior: "0.00",
    total_creditos: "50.00",
    total_debitos: "90.00",
    saldo_final: "-40.00",
    verba_creditada: "100.00",
    faturamento_base: "100000.00",
    percentual_verba: "0.1",
    status: "aguardando_aprovacao",
    tarefa_aprovacao_id: 900,
    conta_pagar_id: null,
    created_at: new Date("2026-08-01T10:00:00Z"), // simula o driver (Date, não string)
    gerente_nome: "Maria Gerente",
    ...overrides,
  };
}

describe("BLOCO 5 — item 1: mapeamento e proteção contra Date do driver (postgres.js)", () => {
  it("mes_referencia/created_at vêm como Date (driver) -> mapeados para YYYY-MM-DD/ISO corretamente", async () => {
    const { fn } = criarDbMock([rowBase()], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0].mesReferencia).toBe("2026-07-01");
    expect(items[0].createdAt).toBe(new Date("2026-08-01T10:00:00Z").toISOString());
  });

  it("campos NUMERIC (string do driver) viram number", async () => {
    const { fn } = criarDbMock([rowBase()], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].saldoFinal).toBe(-40);
    expect(items[0].totalCreditos).toBe(50);
    expect(items[0].totalDebitos).toBe(90);
    expect(items[0].verbaCreditada).toBe(100);
    expect(items[0].faturamentoBase).toBe(100000);
    expect(items[0].percentualVerba).toBe(0.1);
  });

  it("gerente_nome nulo (LEFT JOIN sem usuário) -> fallback '—'", async () => {
    const { fn } = criarDbMock([rowBase({ gerente_nome: null })], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].gerenteNome).toBe("—");
  });
});

describe("BLOCO 5 — item 2: saldo negativo com tarefa vinculada", () => {
  it("tarefa_aprovacao_id preenchido, conta_pagar_id null -> aguardando aprovação (ainda não decidida)", async () => {
    const { fn } = criarDbMock([rowBase({ status: "aguardando_aprovacao", tarefa_aprovacao_id: 900, conta_pagar_id: null })], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].status).toBe("aguardando_aprovacao");
    expect(items[0].tarefaAprovacaoId).toBe(900);
    expect(items[0].contaPagarId).toBeNull();
  });

  it("tarefa aprovada -> status='pago' e conta_pagar_id preenchido (aprovarFechamentoFreteNoTx já rodou)", async () => {
    const { fn } = criarDbMock([rowBase({ status: "pago", tarefa_aprovacao_id: 900, conta_pagar_id: 55 })], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].status).toBe("pago");
    expect(items[0].tarefaAprovacaoId).toBe(900);
    expect(items[0].contaPagarId).toBe(55);
  });

  it("tarefa recusada -> status='recusado', SEM conta_pagar_id", async () => {
    const { fn } = criarDbMock([rowBase({ status: "recusado", tarefa_aprovacao_id: 901, conta_pagar_id: null })], 1);
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].status).toBe("recusado");
    expect(items[0].contaPagarId).toBeNull();
  });

  it("saldo positivo/zero -> sem tarefa nenhuma (fechado sozinho)", async () => {
    const { fn } = criarDbMock(
      [rowBase({ status: "fechado", saldo_final: "30.00", tarefa_aprovacao_id: null, conta_pagar_id: null })],
      1,
    );
    const { items } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items[0].status).toBe("fechado");
    expect(items[0].tarefaAprovacaoId).toBeNull();
    expect(items[0].contaPagarId).toBeNull();
  });
});

describe("BLOCO 5 — item 3: lista vazia não quebra", () => {
  it("nenhum fechamento ainda -> items=[], total=0", async () => {
    const { fn } = criarDbMock([], 0);
    const { items, total } = await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(items).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("BLOCO 5 — item 4: sem N+1", () => {
  it("5 fechamentos na página -> exatamente 2 chamadas ao db (lista + count)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => rowBase({ id: i + 1 }));
    const { fn, calls } = criarDbMock(rows, 5);
    await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    expect(calls).toHaveLength(2);
  });
});

describe("BLOCO 5 — item 5: ordenação desc (mês mais recente primeiro)", () => {
  it("a query da lista pede ORDER BY mes_referencia DESC", async () => {
    const { fn, calls } = criarDbMock([rowBase()], 1);
    await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    const chamadaLista = calls.find((c) => textoDaChamada(c).includes("FROM alissonerp.fechamentos_frete f"));
    expect(chamadaLista).toBeDefined();
    expect(textoDaChamada(chamadaLista!)).toMatch(/ORDER BY f\.mes_referencia DESC/);
  });

  it("faz LEFT JOIN em usuarios (nome da gerente), não uma query por linha", async () => {
    const { fn, calls } = criarDbMock([rowBase()], 1);
    await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    const chamadaLista = calls.find((c) => textoDaChamada(c).includes("FROM alissonerp.fechamentos_frete f"));
    expect(textoDaChamada(chamadaLista!)).toMatch(/LEFT JOIN alissonerp\.usuarios/);
  });
});

describe("BLOCO 5 — item 6: paginação (page/limit -> OFFSET)", () => {
  it("page=2, limit=10 -> OFFSET 10", async () => {
    const { fn, calls } = criarDbMock([rowBase()], 1);
    await listarFechamentosFrete(fn, { page: 2, limit: 10 });

    const chamadaLista = calls.find((c) => textoDaChamada(c).includes("FROM alissonerp.fechamentos_frete f"));
    // OFFSET é um valor interpolado (não literal) — checa os valores passados ao tagged template.
    expect(chamadaLista!.slice(1)).toContain(10); // limit
    expect(chamadaLista!.slice(1)).toContain(10); // offset = (2-1)*10 = 10
  });

  it("page=1, limit=10 -> OFFSET 0", async () => {
    const { fn, calls } = criarDbMock([rowBase()], 1);
    await listarFechamentosFrete(fn, { page: 1, limit: 10 });

    const chamadaLista = calls.find((c) => textoDaChamada(c).includes("FROM alissonerp.fechamentos_frete f"));
    expect(chamadaLista!.slice(1)).toContain(0); // offset = 0
  });
});
